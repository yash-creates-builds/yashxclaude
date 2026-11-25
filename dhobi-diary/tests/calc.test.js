import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusOf, missingOf, charge, monthBill, givenCount } from '../src/core/calc.js';

const batch = (over = {}) => ({
  id: 'b1', dhobiId: 'd1', date: '2026-11-03', createdAt: 1,
  lines: [{ itemId: 'shirt', service: 'iron', qty: 4, rate: 10 }, { itemId: 'kurta', service: 'iron', qty: 1, rate: 12 }],
  received: null, ...over,
});

test('new bundle is pending and charged in full', () => {
  const b = batch();
  assert.equal(statusOf(b), 'pending');
  assert.equal(givenCount(b), 5);
  assert.equal(charge(b), 52);
});

test('one kurta short → partial, kurta missing, not charged', () => {
  const b = batch({ received: { 'shirt|iron': 4, 'kurta|iron': 0 } });
  assert.equal(statusOf(b), 'partial');
  assert.deepEqual(missingOf(b), [{ itemId: 'kurta', service: 'iron', qty: 1 }]);
  assert.equal(charge(b), 40);
});

test('all back → received', () => {
  const b = batch({ received: { 'shirt|iron': 4, 'kurta|iron': 1 } });
  assert.equal(statusOf(b), 'received');
  assert.equal(missingOf(b).length, 0);
});

test('monthly bill filters by month and dhobi, splits by service', () => {
  const list = [
    batch(),
    batch({ id: 'b2', date: '2026-11-20', dhobiId: 'd2', lines: [{ itemId: 'saree', service: 'dry', qty: 1, rate: 250 }] }),
    batch({ id: 'b3', date: '2026-10-30' }),
  ];
  const all = monthBill(list, '2026-11');
  assert.equal(all.list.length, 2);
  assert.equal(all.total, 302);
  assert.equal(all.byService.dry.amount, 250);
  assert.equal(all.pendingItems, 6);
  assert.equal(monthBill(list, '2026-11', 'd2').total, 250);
});
