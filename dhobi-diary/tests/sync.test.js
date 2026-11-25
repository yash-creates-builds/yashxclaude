import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine } from '../src/features/sharing/sync-engine.js';
import { createFakeServer, fakeLocal, memStore } from './fake-supabase.js';

const tick = () => new Promise((r) => setTimeout(r, 20));
const noTimers = { setInterval: () => 1, clearInterval: () => {} };
const batch = (id, qty = 1) => ({ id, dhobiId: 'd1', date: '2026-11-25', lines: [{ itemId: 'shirt', service: 'iron', qty, rate: 10 }], received: null });

function phone(server, initial, store = memStore()) {
  const client = server.client();
  const local = fakeLocal(initial);
  const engine = createSyncEngine({ client, local, store, online: () => client.online, timers: noTimers });
  return { client, local, engine, store };
}

test('create, join (merging both phones), live updates both ways', async () => {
  const s = createFakeServer({ seats: 5 });
  const A = phone(s, { batches: [batch('a1')] });
  const B = phone(s, { batches: [batch('b1')], visits: [{ id: 'v1', date: '2026-11-24', time: '09:00' }] });
  const { code } = await A.engine.create('Mummy');
  await assert.rejects(B.engine.join('ZZZZZZ', 'Papa'), /bad-code/);
  await B.engine.join(code.toLowerCase(), 'Papa');
  await tick(); await A.engine.pull();
  assert.deepEqual(A.local.db.batches.map((b) => b.id).sort(), ['a1', 'b1']);
  assert.deepEqual(B.local.db.batches.map((b) => b.id).sort(), ['a1', 'b1']);
  assert.equal(A.local.db.visits.length, 1);
  assert.deepEqual(A.engine.state.members.map((m) => m.name).sort(), ['Mummy', 'Papa']);

  A.local.change((db) => db.batches.push(batch('a2', 3)));
  await tick();
  assert.ok(B.local.db.batches.some((b) => b.id === 'a2'), 'B gets A’s new bundle live');
  B.local.change((db) => { db.rates.shirt.iron = 12; db.batches.find((b) => b.id === 'a2').received = { 'shirt|iron': 3 }; });
  await tick();
  assert.equal(A.local.db.rates.shirt.iron, 12);
  assert.deepEqual(A.local.db.batches.find((b) => b.id === 'a2').received, { 'shirt|iron': 3 });
  assert.equal(A.engine.state.status, 'synced');
});

test('offline changes wait in the outbox, survive a restart, and sync when back online', async () => {
  const s = createFakeServer({ seats: 5 });
  const A = phone(s);
  const store = memStore();
  const B = phone(s, {}, store);
  const { code, hid } = await A.engine.create('Mummy');
  await B.engine.join(code, 'Papa');
  A.local.change((db) => db.batches.push(batch('x1')));
  await tick();

  B.client.online = false;
  B.local.change((db) => { db.visits.push({ id: 'v9', date: '2026-11-25', time: '10:00' }); db.batches = db.batches.filter((b) => b.id !== 'x1'); });
  await tick();
  assert.equal(B.engine.state.status, 'pending');
  assert.ok(Object.keys(store.get('dhobi-diary.outbox')).length >= 2, 'outbox saved on the phone');
  assert.ok(A.local.db.batches.some((b) => b.id === 'x1'), 'A does not see offline delete yet');

  // B's app restarts while still offline, then the network returns.
  const B2 = { client: B.client, local: fakeLocal(structuredClone(B.local.db)) };
  B2.engine = createSyncEngine({ client: B2.client, local: B2.local, store, online: () => B2.client.online, timers: noTimers });
  await B2.engine.resume({ hid });
  B2.client.online = true;
  B2.engine.wake();
  await tick(); await tick();
  await A.engine.pull();
  assert.ok(!A.local.db.batches.some((b) => b.id === 'x1'), 'delete reached A');
  assert.ok(A.local.db.visits.some((v) => v.id === 'v9'), 'offline visit reached A');
  assert.deepEqual(store.get('dhobi-diary.outbox'), {});
});

test('a pending local edit is not overwritten by the server copy', async () => {
  const s = createFakeServer({ seats: 5 });
  const A = phone(s, { batches: [batch('k', 1)] });
  const B = phone(s);
  const { code } = await A.engine.create('Mummy');
  await B.engine.join(code, 'Papa');
  B.client.online = false;
  B.local.change((db) => { db.batches.find((b) => b.id === 'k').note = 'from B'; });
  A.local.change((db) => { db.batches.find((b) => b.id === 'k').note = 'from A'; });
  await tick();
  B.client.online = true;
  await B.engine.pull(); // server says "from A" but B's unsent edit must survive
  await tick();
  await A.engine.pull();
  assert.equal(B.local.db.batches[0].note, 'from B');
  assert.equal(A.local.db.batches[0].note, 'from B', 'last write wins on both phones');
});

test('leaving stops sync; outsiders see nothing', async () => {
  const s = createFakeServer({ seats: 5 });
  const A = phone(s, { batches: [batch('p')] });
  const B = phone(s);
  const { code } = await A.engine.create('Mummy');
  await B.engine.join(code, 'Papa');
  await B.engine.leave();
  assert.equal(B.engine.state.status, 'off');
  A.local.change((db) => db.batches.push(batch('q')));
  await tick();
  assert.ok(!B.local.db.batches.some((b) => b.id === 'q'), 'B no longer receives');
  const C = s.client(); await C.auth.signInAnonymously();
  const { data } = await C.from('entries').select('*').eq('household_id', 'h1');
  assert.equal(data.length, 0);
});

test('a full family blocks new members until a seat is added', async () => {
  const s = createFakeServer(); // 1 free seat
  const A = phone(s);
  const B = phone(s);
  const { code, hid } = await A.engine.create('Mummy');
  await assert.rejects(B.engine.join(code, 'Papa'), /family-full/);
  s.addSeat(hid); // what the payment webhook does after ₹19 is paid
  await B.engine.join(code, 'Papa');
  await A.engine.pull();
  assert.deepEqual(A.engine.state.members.map((m) => m.name).sort(), ['Mummy', 'Papa']);
});
