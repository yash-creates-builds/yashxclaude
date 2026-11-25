// Family sharing: one diary for the whole household, synced between phones.
// Screens only talk to this file. The Firebase code is loaded only when a family is used,
// so phones without sharing never download or run it.
import { getDB, setFamily, setSetting } from '../../core/db.js';
import { familyAvailable } from './config.js';

let impl = null;
async function load() {
  if (impl) return impl;
  impl = await import('./firebase-sync.js');
  impl.onStatus((s) => { current = s; subs.forEach((fn) => fn(s)); });
  return impl;
}
let current = { status: 'off', members: [], uid: null };
const subs = new Set();

export const family = {
  available: familyAvailable,
  get info() { return getDB().settings.family; },  // { hid, code } or null
  get status() { return current; },
  onStatus(fn) { subs.add(fn); return () => subs.delete(fn); },

  async create(name) {
    const m = await load();
    setSetting('userName', name);
    const f = await m.create(name);
    setFamily(f);
    return f;
  },
  async join(code, name) {
    const m = await load();
    setSetting('userName', name);
    const f = await m.join(code, name);
    setFamily(f);
    return f;
  },
  async rename(name) { setSetting('userName', name); if (impl) await impl.rename(name); },
  async leave() { if (impl) await impl.leave(); setFamily(null); },
};

/** On app start: reconnect if this phone is in a family. */
export async function startSharing() {
  const f = getDB().settings.family;
  if (!familyAvailable() || !f) return;
  const m = await load();
  m.resume(f).catch((e) => console.warn('family resume failed', e));
}
