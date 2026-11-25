// Supabase backend for family sharing. Loaded only when a family diary is used.
// Database setup: supabase/migrations/001_dhobi_diary.sql
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from './config.js';
import { getDB, onChange, applyRemote } from '../../core/db.js';
import { createSyncEngine } from './sync-engine.js';

const client = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dhobi-diary.auth' },
});

const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full */ } },
};

const engine = createSyncEngine({
  client,
  local: { getDB, onChange, applyRemote },
  store,
  online: () => navigator.onLine !== false,
});

// Send waiting changes and fetch others' changes when the phone is back online or the app is opened.
window.addEventListener('online', () => engine.wake());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') engine.wake(); });

export const onStatus = engine.onStatus;
export const resume = engine.resume;
export const create = engine.create;
export const join = engine.join;
export const rename = engine.rename;
export const leave = engine.leave;
