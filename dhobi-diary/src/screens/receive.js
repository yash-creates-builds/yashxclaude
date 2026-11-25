// "Receive clothes": pick a pending bundle → All received, or count each item.
import { screen, go, refresh } from '../ui/router.js';
import { t, fmtDate } from '../i18n/index.js';
import { I } from '../ui/icons.js';
import { esc, topBar, itemName, itemArt, serviceName, dhobiName, batchCard, empty, snack } from '../ui/kit.js';
import { getDB, getBatch, receiveBatch } from '../core/db.js';
import { statusOf, lineKey, receivedQty } from '../core/calc.js';
import { haptic, hapticSuccess, hapticWarning } from '../platform/native.js';

const openBatches = () => getDB().batches.filter((b) => statusOf(b) !== 'received')
  .sort((a, b) => (a.date < b.date ? -1 : 1)); // oldest first: that's usually what comes back

screen('receive', {
  onEnter() {
    const open = openBatches();
    // Only one bundle out? Skip the picker.
    if (open.length === 1) queueMicrotask(() => go('receiveBatch', { id: open[0].id }, { replace: true }));
  },
  view() {
    const open = openBatches();
    return `<main class="screen">
      ${topBar(t('receiveTitle'))}
      ${open.length
        ? `<h2 class="section-title">${esc(t('pickBatch'))}</h2><div class="list">${open.map((b) => batchCard(b, 'pick')).join('')}</div>`
        : empty(t('noPendingToReceive'))}
    </main>`;
  },
  actions: { pick: (el) => go('receiveBatch', { id: el.dataset.id }, { replace: true }) },
});

/* -------------------------------------------------------------- one bundle */
let R = null; // { id, got: { key: qty } }

const missingNow = (b) => b.lines
  .map((l) => ({ l, miss: l.qty - (R.got[lineKey(l)] ?? 0) }))
  .filter((x) => x.miss > 0);

function liveAlert(b) {
  const miss = missingNow(b);
  if (!miss.length) return `<div class="alert alert-ok" id="recv-alert">${I.check}<span>${esc(t('allBack'))}</span></div>`;
  const list = miss.map((x) => `${x.miss} ${itemName(x.l.itemId)}`).join(', ');
  return `<div class="alert alert-red" id="recv-alert" role="alert">${I.alert}<span>${esc(t('missingAlert', list))}</span></div>`;
}

function row(b, l) {
  const k = lineKey(l);
  const got = R.got[k] ?? 0;
  return `<div class="rrow ${got < l.qty ? 'short' : ''}" id="r-${k.replace('|', '-')}">
    <span class="rrow-art">${itemArt(l.itemId)}</span>
    <span class="rrow-name"><b>${esc(itemName(l.itemId))}</b><small>${esc(serviceName(l.service))} · ${esc(t('given'))} ${l.qty}</small></span>
    <div class="counter small">
      <button class="cnt-btn tap" data-act="dec" data-k="${k}" ${got ? '' : 'disabled'} aria-label="−1">${I.minus}</button>
      <output class="cnt">${got}<small>/${l.qty}</small></output>
      <button class="cnt-btn plus tap" data-act="inc" data-k="${k}" ${got < l.qty ? '' : 'disabled'} aria-label="+1">${I.plus}</button>
    </div>
  </div>`;
}

function save(b) {
  const missing = missingNow(b).length > 0;
  receiveBatch(b.id, { ...R.got });
  if (missing) hapticWarning(); else hapticSuccess();
  snack(t('saved'), { canUndo: true, tone: missing ? 'red' : '' });
  if (missing) go('batch', { id: b.id, fresh: '1' }, { replace: true });
  else go('home', {}, { reset: true });
}

screen('receiveBatch', {
  onEnter({ id }) {
    const b = getBatch(id);
    if (!b) return;
    // Start from "everything came back" — the common case. Partial bundles start from what was saved.
    R = { id, got: Object.fromEntries(b.lines.map((l) => [lineKey(l), b.received ? receivedQty(b, l) : l.qty])) };
  },
  view({ id }) {
    const b = getBatch(id);
    if (!b) return `<main class="screen">${topBar(t('receiveTitle'))}${empty(t('noResults'))}</main>`;
    return `<main class="screen">
      ${topBar(t('receiveTitle'))}
      <p class="batch-head">${I.calendar}<b>${esc(fmtDate(b.date, { weekday: 'short', day: 'numeric', month: 'long' }))}</b> · ${esc(dhobiName(b.dhobiId))}</p>

      <button class="big-action receive all-btn tap" data-act="all">
        <span class="big-ic">${I.check}</span>
        <span class="big-txt"><b>${esc(t('allReceived'))}</b><small>${esc(t('items', b.lines.reduce((s, l) => s + l.qty, 0)))}</small></span>
      </button>

      <h2 class="section-title">${esc(t('adjust'))}</h2>
      <div class="rlist">${b.lines.map((l) => row(b, l)).join('')}</div>
      ${liveAlert(b)}
      <div class="footer-bar"><button class="btn btn-primary tap" data-act="save">${I.check}${esc(t('saveReceived'))}</button></div>
    </main>`;
  },
  actions: {
    all() {
      const b = getBatch(R.id);
      for (const l of b.lines) R.got[lineKey(l)] = l.qty;
      save(b);
    },
    inc(el) { const b = getBatch(R.id); const l = b.lines.find((x) => lineKey(x) === el.dataset.k); R.got[el.dataset.k] = Math.min(l.qty, (R.got[el.dataset.k] ?? 0) + 1); haptic(); refresh(); },
    dec(el) { R.got[el.dataset.k] = Math.max(0, (R.got[el.dataset.k] ?? 0) - 1); haptic(); refresh(); },
    save() { save(getBatch(R.id)); },
  },
});
