// In-memory stand-in for the parts of Supabase the sync engine uses, with the same
// access rules as supabase/migrations/001_dhobi_diary.sql (members only).
export function createFakeServer() {
  const households = [];
  const members = [];
  const entries = new Map(); // `${hid}|${kind}|${id}` → row
  const subs = [];
  let n = 0;
  const isMember = (hid, uid) => members.some((m) => m.household_id === hid && m.user_id === uid);
  const denied = { data: null, error: { code: '42501', message: 'permission denied' } };
  const offlineErr = { data: null, error: { message: 'Failed to fetch' } };

  function broadcast(table, row) {
    for (const s of subs) {
      if (s.table === table && s.client.online && s.filter === `household_id=eq.${row.household_id}` && isMember(row.household_id, s.client.uid)) {
        queueMicrotask(() => s.cb({ new: structuredClone(row) }));
      }
    }
  }

  function client() {
    const c = { uid: null, online: true };
    const guard = (fn) => Promise.resolve().then(() => (c.online ? fn() : offlineErr));
    c.auth = {
      getSession: async () => ({ data: { session: c.uid ? { user: { id: c.uid } } : null } }),
      signInAnonymously: () => guard(() => { c.uid = 'user-' + (++n); return { data: { user: { id: c.uid } }, error: null }; }),
    };
    c.rpc = (name, args) => guard(() => {
      if (name === 'create_household') {
        const hid = 'h' + (++n);
        const code = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[01IO]/g, 'X');
        households.push({ id: hid, code });
        members.push({ household_id: hid, user_id: c.uid, name: args.p_name });
        return { data: [{ household_id: hid, code }], error: null };
      }
      if (name === 'join_household') {
        const code = args.p_code.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const h = households.find((x) => x.code === code);
        if (!h) return { data: [], error: null };
        if (!isMember(h.id, c.uid)) members.push({ household_id: h.id, user_id: c.uid, name: args.p_name });
        broadcast('members', { household_id: h.id });
        return { data: [{ household_id: h.id, code }], error: null };
      }
      return { data: null, error: { message: 'no rpc' } };
    });
    c.from = (table) => {
      const q = { filters: [], op: 'select' };
      const run = () => guard(() => {
        const hid = q.filters.find(([k]) => k === 'household_id')?.[1];
        if (q.op === 'upsert') {
          for (const r of q.rows) {
            if (!isMember(r.household_id, c.uid)) return denied;
            const row = { ...structuredClone(r), updated_by: c.uid, updated_at: Date.now() };
            entries.set(`${r.household_id}|${r.kind}|${r.id}`, row);
            broadcast('entries', row);
          }
          return { data: null, error: null };
        }
        if (!isMember(hid, c.uid)) return { data: [], error: null }; // RLS hides rows
        const match = (row) => q.filters.every(([k, v]) => row[k] === v);
        if (table === 'entries') {
          const rows = [...entries.values()].filter(match);
          return { data: structuredClone(rows.slice(q.range?.[0] ?? 0, (q.range?.[1] ?? 1e9) + 1)), error: null };
        }
        if (table === 'members') {
          if (q.op === 'update') { members.filter(match).forEach((m) => Object.assign(m, q.patch)); broadcast('members', { household_id: hid }); return { data: null, error: null }; }
          if (q.op === 'delete') { for (let i = members.length - 1; i >= 0; i--) if (match(members[i])) members.splice(i, 1); return { data: null, error: null }; }
          return { data: structuredClone(members.filter(match)), error: null };
        }
        return { data: [], error: null };
      });
      const b = {
        select() { q.op = 'select'; return b; },
        eq(k, v) { q.filters.push([k, v]); return b; },
        range(a, z) { q.range = [a, z]; return b; },
        upsert(rows) { q.op = 'upsert'; q.rows = rows; return b; },
        update(patch) { q.op = 'update'; q.patch = patch; return b; },
        delete() { q.op = 'delete'; return b; },
        then(res, rej) { return run().then(res, rej); },
      };
      return b;
    };
    c.channel = () => {
      const mine = [];
      const ch = {
        on(_e, opts, cb) { mine.push({ table: opts.table, filter: opts.filter, cb, client: c }); return ch; },
        subscribe(cb) { subs.push(...mine); queueMicrotask(() => cb?.('SUBSCRIBED')); return ch; },
      };
      ch._mine = mine;
      return ch;
    };
    c.removeChannel = (ch) => { for (const s of ch._mine) { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); } };
    return c;
  }
  return { client, entries, members };
}

/** A phone's diary (the parts the engine needs). */
export function fakeLocal(initial) {
  const listeners = new Set();
  const db = { batches: [], visits: [], dhobis: [{ id: 'd1', name: '' }], customItems: [], rates: { shirt: { iron: 10 } }, paid: {}, ...structuredClone(initial || {}) };
  return {
    db,
    getDB: () => db,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    applyRemote: (patch) => { Object.assign(db, structuredClone(patch)); listeners.forEach((fn) => fn(db, null, { remote: true })); },
    change(fn) { fn(db); listeners.forEach((f) => f(db, 'saved')); },
  };
}

export function memStore() { const m = new Map(); return { get: (k) => structuredClone(m.get(k) ?? null), set: (k, v) => m.set(k, structuredClone(v)), m }; }
