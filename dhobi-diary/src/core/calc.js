// Pure calculations — no storage, no UI. Easy to test and reuse (e.g. by a future sync server).
import { monthOf } from './dates.js';

export const lineKey = (l) => `${l.itemId}|${l.service}`;
export const givenCount = (b) => b.lines.reduce((s, l) => s + l.qty, 0);
export const receivedQty = (b, l) => (b.received ? (b.received[lineKey(l)] ?? 0) : 0);
export const receivedCount = (b) => b.lines.reduce((s, l) => s + receivedQty(b, l), 0);

/** 'pending' (nothing back yet) · 'partial' (some missing) · 'received' (all back). */
export function statusOf(b) {
  if (!b.received) return 'pending';
  return b.lines.every((l) => receivedQty(b, l) >= l.qty) ? 'received' : 'partial';
}

/** Lines where fewer came back than were given: [{ itemId, service, qty: missingCount }]. */
export function missingOf(b) {
  if (!b.received) return [];
  return b.lines
    .map((l) => ({ itemId: l.itemId, service: l.service, qty: l.qty - receivedQty(b, l) }))
    .filter((m) => m.qty > 0);
}

/** Estimated cost when giving: everything given × rate. */
export const estimate = (b) => b.lines.reduce((s, l) => s + l.qty * l.rate, 0);

/**
 * What you owe for a batch.
 * Pending → charge what was given (dhobi still has it, it will come back).
 * Received / partial → charge only what came back (never pay for missing clothes).
 */
export function charge(b) {
  if (!b.received) return estimate(b);
  return b.lines.reduce((s, l) => s + Math.min(receivedQty(b, l), l.qty) * l.rate, 0);
}

export function monthBill(batches, ym, dhobiId = null) {
  const list = batches
    .filter((b) => monthOf(b.date) === ym && (!dhobiId || b.dhobiId === dhobiId))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  const byService = { iron: { qty: 0, amount: 0 }, wash: { qty: 0, amount: 0 }, dry: { qty: 0, amount: 0 } };
  let pendingItems = 0;
  let missingItems = 0;
  for (const b of list) {
    const pending = !b.received;
    for (const l of b.lines) {
      const q = pending ? l.qty : Math.min(receivedQty(b, l), l.qty);
      byService[l.service].qty += q;
      byService[l.service].amount += q * l.rate;
      if (pending) pendingItems += l.qty;
      else missingItems += l.qty - Math.min(receivedQty(b, l), l.qty);
    }
  }
  const total = Object.values(byService).reduce((s, v) => s + v.amount, 0);
  const items = Object.values(byService).reduce((s, v) => s + v.qty, 0);
  return { list, byService, total, items, pendingItems, missingItems };
}
