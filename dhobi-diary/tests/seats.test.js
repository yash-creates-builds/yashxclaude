import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { seatFromRevenueCat, seatFromRazorpay, razorpaySignatureOk } from '../supabase/functions/_shared/seats.ts';

const rc = (over = {}) => ({ event: { type: 'NON_RENEWING_PURCHASE', product_id: 'family_seat', store: 'PLAY_STORE', transaction_id: 'GPA.123', app_user_id: 'u1', price_in_purchased_currency: 19, subscriber_attributes: { household_id: { value: 'h1' } }, ...over } });

test('RevenueCat: a family-seat purchase becomes one seat', () => {
  assert.deepEqual(seatFromRevenueCat(rc()), { householdId: 'h1', userId: 'u1', provider: 'play', txn: 'GPA.123', amountPaise: 1900 });
  assert.equal(seatFromRevenueCat(rc({ store: 'APP_STORE' })).provider, 'apple');
});

test('RevenueCat: other events, products or missing family are ignored', () => {
  assert.equal(seatFromRevenueCat(rc({ type: 'CANCELLATION' })), null);
  assert.equal(seatFromRevenueCat(rc({ product_id: 'something_else' })), null);
  assert.equal(seatFromRevenueCat(rc({ subscriber_attributes: {} })), null);
  assert.equal(seatFromRevenueCat(rc({ store: 'STRIPE' })), null);
  assert.equal(seatFromRevenueCat({}), null);
});

const rz = (over = {}) => ({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', amount: 1900, currency: 'INR', notes: { product: 'family_seat', household_id: 'h1', user_id: 'u1' }, ...over } } } });

test('Razorpay: a captured ₹19 seat payment becomes one seat', () => {
  assert.deepEqual(seatFromRazorpay(rz()), { householdId: 'h1', userId: 'u1', provider: 'razorpay', txn: 'pay_1', amountPaise: 1900 });
});

test('Razorpay: wrong event, amount, currency or product is ignored', () => {
  assert.equal(seatFromRazorpay({ ...rz(), event: 'payment.failed' }), null);
  assert.equal(seatFromRazorpay(rz({ amount: 100 })), null);
  assert.equal(seatFromRazorpay(rz({ currency: 'USD' })), null);
  assert.equal(seatFromRazorpay(rz({ notes: { product: 'x', household_id: 'h1' } })), null);
});

test('Razorpay: only correctly signed webhooks are accepted', async () => {
  const body = JSON.stringify(rz());
  const good = createHmac('sha256', 'whsec').update(body).digest('hex');
  assert.equal(await razorpaySignatureOk(body, good, 'whsec'), true);
  assert.equal(await razorpaySignatureOk(body + ' ', good, 'whsec'), false, 'tampered body');
  assert.equal(await razorpaySignatureOk(body, good, 'other-secret'), false);
  assert.equal(await razorpaySignatureOk(body, null, 'whsec'), false);
});
