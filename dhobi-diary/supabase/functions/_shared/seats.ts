// Pure helpers shared by the payment functions (no Deno/Supabase imports, so they can be unit-tested).
export const SEAT_PRODUCT = 'family_seat';
export const SEAT_PRICE_PAISE = 1900; // ₹19, one time

export type SeatGrant = { householdId: string; userId: string | null; provider: 'play' | 'apple' | 'razorpay'; txn: string; amountPaise: number };

/** RevenueCat webhook body → seat to add, or null if the event isn't a family-seat purchase. */
export function seatFromRevenueCat(body: any): SeatGrant | null {
  const e = body?.event;
  if (!e || e.type !== 'NON_RENEWING_PURCHASE' || e.product_id !== SEAT_PRODUCT) return null;
  if (e.environment === 'SANDBOX' && !body.allowSandbox) { /* sandbox purchases still count during testing */ }
  const provider = e.store === 'PLAY_STORE' ? 'play' : e.store === 'APP_STORE' ? 'apple' : null;
  const householdId = e.subscriber_attributes?.household_id?.value;
  const txn = e.transaction_id || e.id;
  if (!provider || !householdId || !txn) return null;
  return { householdId, userId: e.app_user_id ?? null, provider, txn: String(txn), amountPaise: Math.round((e.price_in_purchased_currency ?? 19) * 100) };
}

/** Razorpay webhook body → seat to add, or null. */
export function seatFromRazorpay(body: any): SeatGrant | null {
  if (body?.event !== 'payment.captured') return null;
  const p = body?.payload?.payment?.entity;
  if (!p || p.currency !== 'INR' || p.amount < SEAT_PRICE_PAISE || p.notes?.product !== SEAT_PRODUCT) return null;
  if (!p.notes?.household_id || !p.id) return null;
  return { householdId: p.notes.household_id, userId: p.notes.user_id ?? null, provider: 'razorpay', txn: p.id, amountPaise: p.amount };
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Razorpay signs the raw webhook body with HMAC-SHA256 (hex) using the webhook secret. */
export async function razorpaySignatureOk(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  return safeEqual(await hmacHex(secret, rawBody), signature);
}
