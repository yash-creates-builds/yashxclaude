// Firebase backend for family sharing. Loaded only when a household is used.
//
// Firestore layout (rules: firestore.rules)
//   codes/{CODE}                          → { hid }
//   households/{hid}                      → { code, createdBy, createdAt }
//   households/{hid}/members/{uid}        → { name, code, joinedAt }
//   households/{hid}/batches/{id}         → one bundle
//   households/{hid}/visits/{id}          → one dhobi visit
//   households/{hid}/shared/{rates|paid|customItems|dhobis} → { v }
//
// Works offline: Firestore keeps a local copy and sends queued changes when the phone is online.
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, collection, getDoc, getDocFromServer, onSnapshot, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { firebaseConfig, useEmulator } from './config.js';
import { getDB, onChange, applyRemote } from '../../core/db.js';

const SMALL = ['rates', 'paid', 'customItems', 'dhobis'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

let app, auth, fs;
function init() {
  if (fs) return;
  const cfg = firebaseConfig || { apiKey: 'demo-key', projectId: 'demo-dhobi', appId: 'demo' };
  app = initializeApp(cfg);
  auth = initializeAuth(app, { persistence: indexedDBLocalPersistence }); // works inside the phone app's WebView
  fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(fs, '127.0.0.1', 8080);
  }
}

async function user() {
  init();
  await auth.authStateReady();
  return auth.currentUser || (await signInAnonymously(auth)).user;
}

/** Server round-trips that must succeed (create / join) fail fast when offline. */
const online = (p, ms = 15000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('offline')), ms))]);
const clean = (o) => JSON.parse(JSON.stringify(o)); // drops undefined, which Firestore rejects

/* ------------------------------------------------------------------ diffing */
function snapshot(db) {
  const m = new Map();
  for (const b of db.batches) m.set(`batches/${b.id}`, JSON.stringify(b));
  for (const v of db.visits) m.set(`visits/${v.id}`, JSON.stringify(v));
  for (const k of SMALL) m.set(`shared/${k}`, JSON.stringify(db[k]));
  return m;
}

let base = null;      // what the server is known to have
let hid = null;
let unsubs = [];
let stopLocal = null;
const state = { status: 'off', members: [], uid: null };
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn({ ...state }));
export const onStatus = (fn) => { listeners.add(fn); fn({ ...state }); return () => listeners.delete(fn); };

async function writeAll(paths, deletes = []) {
  const db = getDB();
  const ops = [];
  for (const p of paths) {
    const [coll, id] = p.split('/');
    let data;
    if (coll === 'shared') data = { v: db[id] };
    else data = (coll === 'batches' ? db.batches : db.visits).find((x) => x.id === id);
    if (data) ops.push(['set', doc(fs, 'households', hid, coll, id), clean(data)]);
  }
  for (const p of deletes) { const [coll, id] = p.split('/'); ops.push(['del', doc(fs, 'households', hid, coll, id)]); }
  // Firestore allows 500 writes per batch.
  for (let i = 0; i < ops.length; i += 450) {
    const wb = writeBatch(fs);
    for (const [kind, ref, data] of ops.slice(i, i + 450)) kind === 'set' ? wb.set(ref, data) : wb.delete(ref);
    wb.commit().catch((e) => console.warn('sync write failed', e));
  }
}

function pushLocalChanges() {
  if (!hid || !base) return;
  const now = snapshot(getDB());
  const changed = [...now].filter(([k, v]) => base.get(k) !== v).map(([k]) => k);
  const removed = [...base.keys()].filter((k) => !now.has(k));
  base = now;
  if (changed.length || removed.length) writeAll(changed, removed);
}

/* ------------------------------------------------------------------ live sync */
function listen() {
  stopAll();
  const got = new Set();
  const status = (meta) => {
    state.status = meta.hasPendingWrites || meta.fromCache ? 'pending' : 'synced';
    emit();
  };
  const remote = (patch) => { applyRemote(patch); base = snapshot(getDB()); };

  for (const coll of ['batches', 'visits']) {
    unsubs.push(onSnapshot(collection(fs, 'households', hid, coll), { includeMetadataChanges: true }, (snap) => {
      remote({ [coll]: snap.docs.map((d) => d.data()) });
      got.add(coll);
      status(snap.metadata);
    }, onError));
  }
  for (const k of SMALL) {
    unsubs.push(onSnapshot(doc(fs, 'households', hid, 'shared', k), (snap) => {
      if (snap.exists()) remote({ [k]: snap.data().v });
    }, onError));
  }
  unsubs.push(onSnapshot(collection(fs, 'households', hid, 'members'), (snap) => {
    state.members = snap.docs.map((d) => ({ uid: d.id, name: d.data().name }));
    emit();
  }, onError));
  stopLocal = onChange((_db, _label, meta) => { if (!meta?.remote) pushLocalChanges(); });
}

function onError(e) {
  console.warn('sync', e);
  if (e.code === 'permission-denied') { state.status = 'removed'; emit(); }
}

function stopAll() {
  unsubs.forEach((u) => u());
  unsubs = [];
  stopLocal?.();
  stopLocal = null;
}

/* ------------------------------------------------------------------ public API */
export async function resume(family) {
  const u = await user();
  hid = family.hid;
  state.uid = u.uid;
  base = snapshot(getDB());
  listen();
}

export async function create(name) {
  const u = await user();
  let code;
  for (let tries = 0; tries < 5; tries++) {
    code = Array.from(crypto.getRandomValues(new Uint32Array(6)), (n) => CODE_CHARS[n % CODE_CHARS.length]).join('');
    const taken = await online(getDocFromServer(doc(fs, 'codes', code)));
    if (!taken.exists()) break;
  }
  hid = doc(collection(fs, 'households')).id;
  const wb = writeBatch(fs);
  wb.set(doc(fs, 'households', hid), { code, createdBy: u.uid, createdAt: serverTimestamp() });
  wb.set(doc(fs, 'households', hid, 'members', u.uid), { name, code, joinedAt: serverTimestamp() });
  wb.set(doc(fs, 'codes', code), { hid });
  await online(wb.commit());
  // Upload everything this phone already has.
  const db = getDB();
  await writeAll([...snapshot(db).keys()]);
  state.uid = u.uid;
  base = snapshot(db);
  listen();
  return { hid, code };
}

/** Join with a code. This phone's own entries are added to the family diary (nothing is lost). */
export async function join(rawCode, name) {
  const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const u = await user();
  const c = await online(getDocFromServer(doc(fs, 'codes', code)));
  if (!c.exists()) throw new Error('bad-code');
  hid = c.data().hid;
  await online(writeBatch(fs).set(doc(fs, 'households', hid, 'members', u.uid), { name, code, joinedAt: serverTimestamp() }).commit());

  // Merge: the family's settings win; this phone's extra dhobis, items, bundles and visits are added.
  const db = getDB();
  const remote = {};
  for (const k of SMALL) {
    const s = await online(getDocFromServer(doc(fs, 'households', hid, 'shared', k)));
    if (s.exists()) remote[k] = s.data().v;
  }
  const byId = (a = [], b = []) => [...a, ...b.filter((x) => !a.some((y) => y.id === x.id))];
  const merged = {
    dhobis: byId(remote.dhobis, db.dhobis),
    customItems: byId(remote.customItems, db.customItems),
    rates: { ...db.rates, ...(remote.rates || {}) },
    paid: { ...db.paid, ...(remote.paid || {}) },
  };
  applyRemote(merged);
  await writeAll([...snapshot(getDB()).keys()]);
  state.uid = u.uid;
  base = snapshot(getDB());
  listen();
  return { hid, code };
}

export async function rename(name) {
  if (!hid || !state.uid) return;
  const me = doc(fs, 'households', hid, 'members', state.uid);
  const cur = await getDoc(me);
  if (cur.exists()) writeBatch(fs).update(me, { name }).commit().catch(() => {});
}

export async function leave() {
  if (hid && state.uid) writeBatch(fs).delete(doc(fs, 'households', hid, 'members', state.uid)).commit().catch(() => {});
  stopAll();
  hid = null;
  base = null;
  state.status = 'off';
  state.members = [];
  emit();
}
