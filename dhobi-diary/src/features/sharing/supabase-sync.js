// Supabase backend for family sharing. Loaded only when a family diary is used.
// Database setup: supabase/migrations/001_dhobi_diary.sql
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey, revenueCatKeys } from './config.js';
import { Capacitor } from '@capacitor/core';
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

/* ------------------------------------------------------------ family seats */
export async function getSeats(hid) {
  const { data, error } = await client.rpc('family_seats', { p_household: hid });
  if (error) throw error;
  return data?.[0] || null; // { used, total }
}

/** After paying, the store tells our server (webhook), which adds the seat. Wait for it to show up. */
async function waitForSeat(hid, before) {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await getSeats(hid).catch(() => null);
    if (s && s.total > before) return { status: 'added', seats: s };
  }
  return { status: 'pending' };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = Object.assign(document.createElement('script'), { src, onload: resolve, onerror: reject });
    document.head.append(el);
  });
}

/** Buy one ₹19 seat. Resolves { status: 'added' | 'pending' | 'cancelled' }. */
export async function buySeat(hid) {
  const before = (await getSeats(hid))?.total ?? 1;
  const uid = engine.state.uid;
  if (Capacitor.isNativePlatform()) {
    const { Purchases, PRODUCT_CATEGORY } = await import('@revenuecat/purchases-capacitor');
    const apiKey = Capacitor.getPlatform() === 'ios' ? revenueCatKeys.ios : revenueCatKeys.android;
    await Purchases.configure({ apiKey, appUserID: uid });
    await Purchases.setAttributes({ household_id: hid });
    const { products } = await Purchases.getProducts({ productIdentifiers: ['family_seat'], type: PRODUCT_CATEGORY.NON_SUBSCRIPTION });
    if (!products?.length) throw new Error('no-product');
    try { await Purchases.purchaseStoreProduct({ product: products[0] }); } catch (e) {
      if (e?.userCancelled || String(e?.code) === '1') return { status: 'cancelled' };
      throw e;
    }
    return waitForSeat(hid, before);
  }
  // Website: Razorpay Checkout (UPI, cards, netbanking)
  await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  const { data: order, error } = await client.functions.invoke('razorpay-order', { body: { household_id: hid } });
  if (error) throw error;
  const paid = await new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: order.key_id, order_id: order.order_id, amount: order.amount, currency: order.currency,
      name: 'Dhobi Diary', description: '1 family seat (one time)', theme: { color: '#141414' },
      handler: () => resolve(true), modal: { ondismiss: () => resolve(false) },
    });
    rzp.open();
  });
  return paid ? waitForSeat(hid, before) : { status: 'cancelled' };
}
