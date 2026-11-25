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
    settings: { lang: null, grandma: false, reminderDays: [], reminderTime: '09:00' },
    dhobis: [{ id: 'd1', name: '' }], // name '' → shown as "Dhobi" in the current language
    rates: structuredClone(DEFAULT_RATES),
    customItems: [], // [{ id, name }]
    batches: [],     // see addBatch()
    paid: {},        // { 'YYYY-MM:dhobiId': timestamp }
  };
}

/** Fill gaps so older or hand-edited backups always load. */
function normalize(raw) {
  const db = { ...fresh(), ...(raw || {}) };
  db.settings = { ...fresh().settings, ...(raw?.settings || {}) };
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
 *   received: null | { 'itemId|service': qty }, receivedDate }
 */
export const addBatch = ({ dhobiId, date, lines, note = '' }) => change('saved', () => {
  const b = {
    id: uid(), dhobiId, date: date || today(), createdAt: Date.now(), note,
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

export const receiveBatch = (id, received) => change('saved', () => {
  const b = db.batches.find((x) => x.id === id);
  if (b) { b.received = received; b.receivedDate = today(); }
  return b;
});

export const deleteBatch = (id) => change('deleted', () => { db.batches = db.batches.filter((b) => b.id !== id); });
export const getBatch = (id) => db.batches.find((b) => b.id === id);

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
  return change('restored', () => { db = normalize(raw); });
}
