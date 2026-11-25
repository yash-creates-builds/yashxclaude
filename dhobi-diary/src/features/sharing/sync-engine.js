// Family sync engine (backend-agnostic, no imports): keeps this phone's diary and the
// household's online copy in step.
//
//  - Local first: the phone's diary is always usable. Every local change is diffed and put in an
//    "outbox" that is saved on the phone, so changes made offline survive app restarts.
//  - The outbox is sent when online (on change, when the network returns, every 30 s).
//  - Changes from other phones arrive live (realtime) and on every pull (app opened / back online).
//  - A row that still has an unsent local change is never overwritten by the server copy.
//
// Rows on the server: { household_id, kind: 'batches'|'visits'|'shared', id, data, deleted }

const SMALL = ['rates', 'paid', 'customItems', 'dhobis'];

/** Diary → Map('kind/id' → JSON string of what would be stored). */
export function snapshot(db) {
  const m = new Map();
  for (const b of db.batches) m.set(`batches/${b.id}`, JSON.stringify(b));
  for (const v of db.visits) m.set(`visits/${v.id}`, JSON.stringify(v));
  for (const k of SMALL) m.set(`shared/${k}`, JSON.stringify({ v: db[k] }));
  return m;
}

/** Server rows → diary collections. */
export function fromRows(rows) {
  const out = { batches: [], visits: [] };
  for (const r of rows) {
    if (r.deleted || !r.data) continue;
    if (r.kind === 'shared') { if (SMALL.includes(r.id)) out[r.id] = r.data.v; } else if (out[r.kind]) out[r.kind].push(r.data);
  }
  return out;
}

/**
 * @param client  Supabase-like client (rpc, from, channel, auth)
 * @param local   { getDB, onChange(fn) → unsubscribe, applyRemote(patch) }
 * @param store   { get(key), set(key, value) } for the outbox (localStorage on phones)
 * @param online  () → boolean
 */
export function createSyncEngine({ client, local, store, online = () => true, timers = globalThis }) {
  const OUTBOX = 'dhobi-diary.outbox';
  let hid = null;
  let uid = null;
  let base = null;
  let outbox = new Map(Object.entries(store.get(OUTBOX) || {})); // key → { kind, id, data, deleted }
  let channel = null;
  let stopLocal = null;
  let flushing = null;
  let interval = 0;
  const state = { status: 'off', members: [], uid: null };
  const listeners = new Set();

  const emit = () => listeners.forEach((fn) => fn({ ...state }));
  const saveOutbox = () => store.set(OUTBOX, Object.fromEntries(outbox));
  const setStatus = (s) => { if (state.status !== 'removed') state.status = s; emit(); };
  const refreshStatus = () => setStatus(outbox.size || !online() ? 'pending' : 'synced');
  const check = ({ data, error }) => { if (error) throw Object.assign(new Error(error.message || 'sync'), { cause: error }); return data; };

  async function signIn() {
    const { data } = await client.auth.getSession();
    if (data?.session?.user) return data.session.user.id;
    const res = check(await client.auth.signInAnonymously());
    return res.user.id;
  }

  /* ---------------- local → outbox */
  function queueLocalChanges() {
    if (!hid || !base) return;
    const now = snapshot(local.getDB());
    for (const [k, json] of now) {
      if (base.get(k) !== json) { const [kind, id] = k.split('/'); outbox.set(k, { kind, id, data: JSON.parse(json), deleted: false }); }
    }
    for (const k of base.keys()) {
      if (!now.has(k)) { const [kind, id] = k.split('/'); outbox.set(k, { kind, id, data: null, deleted: true }); }
    }
    base = now;
    saveOutbox();
    flush();
  }

  /* ---------------- outbox → server */
  function flush() {
    if (!hid || flushing) return flushing;
    if (!outbox.size || !online()) { refreshStatus(); return null; }
    setStatus('pending');
    flushing = (async () => {
      try {
        const batch = [...outbox.entries()].slice(0, 400);
        const rows = batch.map(([, r]) => ({ household_id: hid, kind: r.kind, id: r.id, data: r.data, deleted: r.deleted }));
        check(await client.from('entries').upsert(rows));
        for (const [k, r] of batch) if (outbox.get(k) === r) outbox.delete(k); // keep it if it changed meanwhile
        saveOutbox();
      } catch (e) {
        if (String(e?.cause?.code) === '42501') { state.status = 'removed'; emit(); } // RLS: no longer a member
      } finally {
        flushing = null;
      }
      if (outbox.size && online() && state.status !== 'removed') return flush();
      refreshStatus();
      return null;
    })();
    return flushing;
  }

  /* ---------------- server → local */
  function applyRows(rows, { full = false } = {}) {
    const db = local.getDB();
    const coll = { batches: new Map(db.batches.map((b) => [b.id, b])), visits: new Map(db.visits.map((v) => [v.id, v])) };
    if (full) { coll.batches.clear(); coll.visits.clear(); }
    const patch = {};
    for (const r of rows) {
      const k = `${r.kind}/${r.id}`;
      if (outbox.has(k)) continue; // our unsent change wins
      if (r.kind === 'shared') { if (!r.deleted && r.data && SMALL.includes(r.id)) patch[r.id] = r.data.v; continue; }
      if (!coll[r.kind]) continue;
      if (r.deleted || !r.data) coll[r.kind].delete(r.id); else coll[r.kind].set(r.id, r.data);
    }
    if (full) {
      // Keep local items whose create/edit is still waiting in the outbox.
      for (const [k, r] of outbox) if (coll[r.kind] && !r.deleted) coll[r.kind].set(r.id, r.data);
    }
    patch.batches = [...coll.batches.values()];
    patch.visits = [...coll.visits.values()];
    local.applyRemote(patch);
    base = snapshot(local.getDB());
    // Anything in the outbox is still "different from the server", keep base pointing at server state for those keys.
    for (const [k] of outbox) base.delete(k);
  }

  async function selectAll(table, cols = '*') {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const rows = check(await client.from(table).select(cols).eq('household_id', hid).range(from, from + 999));
      all.push(...rows);
      if (rows.length < 1000) return all;
    }
  }

  async function pull() {
    if (!hid || !online()) { refreshStatus(); return; }
    try {
      const [rows, members] = await Promise.all([selectAll('entries'), selectAll('members', 'user_id,name')]);
      state.members = members.map((m) => ({ uid: m.user_id, name: m.name }));
      if (!members.some((m) => m.user_id === uid)) { state.status = 'removed'; emit(); return; }
      applyRows(rows, { full: true });
      emit();
      await flush();
    } catch { refreshStatus(); }
  }

  function listen() {
    stop();
    channel = client.channel(`household-${hid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: `household_id=eq.${hid}` }, (p) => {
        if (p.new && p.new.kind) applyRows([p.new]);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `household_id=eq.${hid}` }, () => { pull(); })
      .subscribe((s) => { if (s === 'SUBSCRIBED') pull(); });
    stopLocal = local.onChange((_db, _label, meta) => { if (!meta?.remote) queueLocalChanges(); });
    interval = timers.setInterval(() => { flush(); }, 30000);
  }

  function stop() {
    if (channel) { client.removeChannel ? client.removeChannel(channel) : channel.unsubscribe?.(); channel = null; }
    stopLocal?.(); stopLocal = null;
    if (interval) timers.clearInterval(interval);
    interval = 0;
  }

  function begin(householdId) {
    hid = householdId;
    state.uid = uid;
    state.status = 'pending';
    base = snapshot(local.getDB());
    listen();
  }

  /** Queue every row this phone has (first upload after create / join). */
  function queueEverything() {
    for (const [k, json] of snapshot(local.getDB())) { const [kind, id] = k.split('/'); outbox.set(k, { kind, id, data: JSON.parse(json), deleted: false }); }
    saveOutbox();
  }

  return {
    onStatus(fn) { listeners.add(fn); fn({ ...state }); return () => listeners.delete(fn); },
    get state() { return { ...state }; },
    pull, flush,
    /** Call when the network comes back or the app comes to the front. */
    wake() { flush(); pull(); },

    async resume(family) {
      uid = await signIn();
      begin(family.hid);
      await pull();
    },

    async create(name) {
      uid = await signIn();
      const [row] = check(await client.rpc('create_household', { p_name: name }));
      begin(row.household_id);
      queueEverything();
      await flush();
      await pull();
      return { hid: row.household_id, code: row.code };
    },

    /** Join with a code. This phone's own entries are added to the family diary (nothing is lost). */
    async join(rawCode, name) {
      uid = await signIn();
      const rows = check(await client.rpc('join_household', { p_code: rawCode, p_name: name }));
      if (!rows?.length) throw new Error('bad-code');
      hid = rows[0].household_id;
      // Merge: the family's settings win; this phone's extra dhobis, items, bundles and visits are added.
      const remote = fromRows(await selectAll('entries'));
      const db = local.getDB();
      const byId = (a = [], b = []) => [...a, ...b.filter((x) => !a.some((y) => y.id === x.id))];
      local.applyRemote({
        dhobis: byId(remote.dhobis, db.dhobis),
        customItems: byId(remote.customItems, db.customItems),
        rates: { ...db.rates, ...(remote.rates || {}) },
        paid: { ...db.paid, ...(remote.paid || {}) },
        batches: byId(remote.batches, db.batches),
        visits: byId(remote.visits, db.visits),
      });
      begin(hid);
      queueEverything();
      await flush();
      await pull();
      return { hid, code: rows[0].code };
    },

    async rename(name) {
      if (!hid || !uid) return;
      try { check(await client.from('members').update({ name }).eq('household_id', hid).eq('user_id', uid)); } catch { /* offline: name stays local */ }
      pull();
    },

    async leave() {
      if (hid && uid) { try { check(await client.from('members').delete().eq('household_id', hid).eq('user_id', uid)); } catch { /* offline */ } }
      stop();
      hid = null; base = null;
      outbox = new Map(); saveOutbox();
      state.status = 'off'; state.members = [];
      emit();
    },
  };
}
