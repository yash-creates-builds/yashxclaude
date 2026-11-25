// The diary: one plain object, saved whole after every change.
// All reads/writes go through this file, so a cloud/sync backend can be added later
// (see src/features/sharing) without touching the screens.
import { DEFAULT_RATES, CUSTOM_RATE, BUILT_IN_ITEMS } from './catalog.js';
import { readDB, writeDB } from './storage.js';
import { today } from './dates.js';

export const SCHEMA = 1;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function fresh() {
  return {
    schema: SCHEMA,
    // Settings are per phone (never synced): language, Grandma Mode, your name, family link.
    settings: { lang: null, grandma: false, userName: '', family: null },
    dhobis: [{ id: 'd1', name: '' }], // name '' → shown as "Dhobi" in the current language
    rates: structuredClone(DEFAULT_RATES),
    customItems: [], // [{ id, name }]
    batches: [],     // see addBatch()
    paid: {},        // { 'YYYY-MM:dhobiId': timestamp }
    visits: [],      // see addVisit()
  };
}

/** Fill gaps so older or hand-edited backups always load. */
function normalize(raw) {
  const db = { ...fresh(), ...(raw || {}) };
  db.settings = { ...fresh().settings, ...(raw?.settings || {}) };
  delete db.settings.reminderDays; delete db.settings.reminderTime; // removed feature
  db.visits ||= [];
  db.rates = { ...structuredClone(DEFAULT_RATES), ...(raw?.rates || {}) };
  for (const c of db.customItems) db.rates[c.id] ||= { ...CUSTOM_RATE };
  if (!db.dhobis.length) db.dhobis = fresh().dhobis;
  db.schema = SCHEMA;
  return db;
}

let db = fresh();
let undoStack = null; // one level of undo: { label, snapshot }
const listeners = new Set();

export async function initDB() { db = normalize(await readDB()); return db; }
export const getDB = () => db;
const by = () => db.settings.userName || '';
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function commit(undoLabel) {
  writeDB(db);
  listeners.forEach((fn) => fn(db, undoLabel));
}

/** Wrap a change so it can be undone once (used by the "Undo" snackbar). */
function change(undoLabel, fn) {
  const snapshot = structuredClone(db);
  const result = fn();
  if (undoLabel) undoStack = { label: undoLabel, snapshot };
  commit(undoLabel);
  return result;
}

export function undo() {
  if (!undoStack) return false;
  db = undoStack.snapshot;
  undoStack = null;
  commit(null);
  return true;
}

/* ----------------------------------------------------------- settings */
export const setSetting = (k, v) => change(null, () => { db.settings[k] = v; });

/* ----------------------------------------------------------- dhobis */
export const addDhobi = (name) => change(null, () => {
  const d = { id: uid(), name: name.trim() };
  db.dhobis.push(d);
  return d;
});
export const renameDhobi = (id, name) => change(null, () => { const d = db.dhobis.find((x) => x.id === id); if (d) d.name = name.trim(); });
export const deleteDhobi = (id) => change('deleted', () => {
  db.dhobis = db.dhobis.filter((d) => d.id !== id);
  db.batches = db.batches.filter((b) => b.dhobiId !== id);
  db.visits = db.visits.filter((v) => v.dhobiId !== id);
  if (!db.dhobis.length) db.dhobis = fresh().dhobis;
});

/* ----------------------------------------------------------- items + rates */
export const allItemIds = () => [...BUILT_IN_ITEMS, ...db.customItems.map((c) => c.id)];
export const customItem = (id) => db.customItems.find((c) => c.id === id);
export const addCustomItem = (name) => change(null, () => {
  const c = { id: 'c_' + uid(), name: name.trim() };
  db.customItems.push(c);
  db.rates[c.id] = { ...CUSTOM_RATE };
  return c;
});
export const deleteCustomItem = (id) => change(null, () => { db.customItems = db.customItems.filter((c) => c.id !== id); });
export const setRate = (itemId, service, value) => change(null, () => {
  db.rates[itemId] = { ...(db.rates[itemId] || CUSTOM_RATE), [service]: Math.max(0, Math.round(Number(value) || 0)) };
});
export const resetRates = () => change('ratesReset', () => {
  db.rates = { ...db.rates, ...structuredClone(DEFAULT_RATES) };
});

/* ----------------------------------------------------------- batches */
/**
 * A batch = one hand-over to the dhobi.
 * { id, dhobiId, date, createdAt, note,
 *   lines: [{ itemId, service, qty, rate }],  // rate is frozen at give time
 *   received: null | { 'itemId|service': qty }  (running total of everything back so far),
 *   receipts: [{ date, got: { key: qty }, by }]  (each time clothes came back; dates can be back-dated),
 *   receivedDate }  (latest receipt date)
 */
export const addBatch = ({ dhobiId, date, lines, note = '' }) => change('saved', () => {
  const b = {
    id: uid(), dhobiId, date: date || today(), createdAt: Date.now(), note, by: by(),
    lines: lines.filter((l) => l.qty > 0).map((l) => ({ ...l, rate: db.rates[l.itemId]?.[l.service] ?? 0 })),
    received: null, receivedDate: null,
  };
  db.batches.push(b);
  return b;
});

export const updateBatch = (id, patch) => change('saved', () => {
  const b = db.batches.find((x) => x.id === id);
  if (b) Object.assign(b, patch);
  return b;
});

/** Add what came back now (on `date`) to what came back before. */
export const receiveBatch = (id, add, date = today()) => change('saved', () => {
  const b = db.batches.find((x) => x.id === id);
  if (!b) return b;
  const prev = b.received || {};
  const next = {};
  const got = {};
  for (const l of b.lines) {
    const k = `${l.itemId}|${l.service}`;
    const n = Math.max(0, Math.min(l.qty - (prev[k] || 0), add[k] || 0));
    next[k] = (prev[k] || 0) + n;
    if (n) got[k] = n;
  }
  b.received = next;
  b.receipts = [...(b.receipts || [])];
  if (Object.keys(got).length) b.receipts.push({ date, got, by: by(), at: Date.now() });
  const dates = b.receipts.map((r) => r.date).sort();
  b.receivedDate = dates[dates.length - 1] || date;
  b.receivedBy = by();
  return b;
});

export const deleteBatch = (id) => change('deleted', () => { db.batches = db.batches.filter((b) => b.id !== id); });
export const getBatch = (id) => db.batches.find((b) => b.id === id);

/* ----------------------------------------------------------- visits */
/** A visit = the dhobi came to the house. { id, dhobiId, date 'YYYY-MM-DD', time 'HH:MM', by, createdAt } */
export const addVisit = ({ dhobiId, date, time }) => change('saved', () => {
  const v = { id: uid(), dhobiId, date, time, by: by(), createdAt: Date.now() };
  db.visits.push(v);
  return v;
});
export const deleteVisit = (id) => change('deleted', () => { db.visits = db.visits.filter((v) => v.id !== id); });
export const sortedVisits = () => [...db.visits].sort((a, b) => (`${b.date} ${b.time}` > `${a.date} ${a.time}` ? 1 : -1));

/* ----------------------------------------------------------- payments */
export const paidKey = (ym, dhobiId) => `${ym}:${dhobiId}`;
export const setPaid = (ym, dhobiIds, on) => change('saved', () => {
  for (const id of dhobiIds) {
    if (on) db.paid[paidKey(ym, id)] = Date.now(); else delete db.paid[paidKey(ym, id)];
  }
});

/* ----------------------------------------------------------- backup */
export const exportData = () => structuredClone(db);
export function importData(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.batches)) throw new Error('bad-file');
  const keep = { family: db.settings.family, userName: db.settings.userName };
  return change('restored', () => { db = normalize(raw); Object.assign(db.settings, keep); });
}

/* ----------------------------------------------------------- sync hooks */
// The family-sync module (src/features/sharing) replaces shared parts of the diary with what
// it receives from other phones. Not undoable, and not echoed back to the server.
export const SHARED_KEYS = ['dhobis', 'rates', 'customItems', 'batches', 'paid', 'visits'];
export function applyRemote(patch) {
  for (const k of SHARED_KEYS) if (k in patch) db[k] = patch[k];
  if (!db.dhobis.length) db.dhobis = fresh().dhobis;
  writeDB(db);
  listeners.forEach((fn) => fn(db, null, { remote: true }));
}
export const setFamily = (family) => { db.settings.family = family; writeDB(db); };
