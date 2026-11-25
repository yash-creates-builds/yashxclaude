// "Receive clothes": pick a bundle, mark each item. A running count shows how many are back;
// "All received" only appears once every piece is back. Partial returns can be added later, with their own date.
import { screen, go, refresh } from '../ui/router.js';
import { t, fmtDate } from '../i18n/index.js';
import { I } from '../ui/icons.js';
import { esc, topBar, itemName, itemArt, serviceName, dhobiName, batchCard, empty, snack } from '../ui/kit.js';
import { getDB, getBatch, receiveBatch } from '../core/db.js';
import { statusOf, lineKey, receivedQty, givenCount } from '../core/calc.js';
import { today, daysAgo } from '../core/dates.js';
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
// prev = already back before today's entry · add = coming back now · mode = what the user tapped
let R = null; // { id, prev: {k}, add: {k}, mode: {k: 'yes'|'no'|'some'|null}, date }

const remaining = (l) => l.qty - (R.prev[lineKey(l)] || 0);
const openLines = (b) => b.lines.filter((l) => remaining(l) > 0);
const leftToMark = (b) => openLines(b).filter((l) => !R.mode[lineKey(l)]).length;
const backCount = (b) => b.lines.reduce((s, l) => s + (R.prev[lineKey(l)] || 0) + (R.add[lineKey(l)] || 0), 0);

function counter(b) {
  const got = backCount(b);
  const total = givenCount(b);
  const done = got >= total;
  const pct = total ? Math.round((got / total) * 100) : 0;
  return `<div class="recv-count ${done ? 'done' : ''}" aria-live="polite">
    <b>${done ? `${I.check}${esc(t('allReceived'))}` : esc(t('receivedOf', got, total))}</b>
    <span class="recv-bar"><i style="width:${pct}%"></i></span>
  </div>`;
}

function notBackAlert(b) {
  const list = openLines(b).filter((l) => R.mode[lineKey(l)])
    .map((l) => ({ l, n: remaining(l) - (R.add[lineKey(l)] || 0) }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${itemName(x.l.itemId)}`).join(', ');
  return list ? `<div class="alert alert-red" role="alert">${I.alert}<span>${esc(t('notBackYet', list))}</span></div>` : '';
}

function dateRow(b) {
  const opts = [[today(), t('today')], [daysAgo(1), t('yesterday')]].filter(([d]) => d >= b.date);
  const other = !opts.some(([d]) => d === R.date);
  return `<h2 class="label">${esc(t('cameBackOn'))}</h2>
  <div class="seg-row recv-date">
    ${opts.map(([d, label]) => `<button class="seg tap ${R.date === d ? 'on' : ''}" data-act="r-date" data-v="${d}">${esc(label)}</button>`).join('')}
    <label class="seg tap seg-date ${other ? 'on' : ''}">${I.calendar}<span>${esc(other ? fmtDate(R.date) : t('pickDate'))}</span>
      <input type="date" data-change="r-pick-date" value="${R.date}" min="${b.date}" max="${today()}"></label>
  </div>`;
}

/** One item: ✓ came back · ✗ not back · Some (only when more than one is still out). */
function row(b, l) {
  const k = lineKey(l);
  const rem = remaining(l);
  const prev = R.prev[k] || 0;
  const head = `<div class="rrow2-top">
      <span class="rrow-art">${itemArt(l.itemId)}</span>
      <span class="rrow-name"><b>${esc(itemName(l.itemId))}</b><small>${esc(serviceName(l.service))} · ${esc(t('given'))} ${l.qty}${prev ? ` · ${esc(t('alreadyBack', prev))}` : ''}</small></span>
    </div>`;
  if (rem <= 0) return `<div class="rrow2 is-yes is-done">${head.replace('</span>\n    </div>', `</span><span class="done-tick">${I.check}</span>\n    </div>`)}</div>`;
  const mode = R.mode[k];
  const add = R.add[k] || 0;
  const opt = (m, label, icon = '') => `<button class="rchoice rc-${m} tap ${mode === m ? 'on' : ''}" data-act="pick-mode" data-k="${k}" data-m="${m}" aria-pressed="${mode === m}">${icon}<span>${esc(label)}</span></button>`;
  return `<div class="rrow2 ${mode ? 'is-' + mode : ''}">
    ${head}
    <div class="rchoices ${rem > 1 ? 'three' : ''}">
      ${opt('yes', t('rcYes'), I.check)}${opt('no', t('rcNo'), I.close)}${rem > 1 ? opt('some', t('rcSome')) : ''}
    </div>
    ${mode === 'some' ? `<div class="some-row"><span>${esc(t('got'))}</span>
      <div class="counter small">
        <button class="cnt-btn tap" data-act="dec" data-k="${k}" ${add > 1 ? '' : 'disabled'} aria-label="−1">${I.minus}</button>
        <output class="cnt">${add}<small>/${rem}</small></output>
        <button class="cnt-btn plus tap" data-act="inc" data-k="${k}" ${add < rem - 1 ? '' : 'disabled'} aria-label="+1">${I.plus}</button>
      </div></div>` : ''}
  </div>`;
}

function save(b) {
  receiveBatch(b.id, { ...R.add }, R.date);
  const nb = getBatch(b.id);
  const allBack = statusOf(nb) === 'received';
  if (allBack) hapticSuccess(); else hapticWarning();
  snack(allBack ? t('allBack') : t('saved'), { canUndo: true });
  if (allBack) go('home', {}, { reset: true });
  else go('batch', { id: b.id }, { replace: true });
}

screen('receiveBatch', {
  onEnter({ id }) {
    const b = getBatch(id);
    if (!b) return;
    R = { id, prev: {}, add: {}, mode: {}, date: today() < b.date ? b.date : today() };
    for (const l of b.lines) {
      const k = lineKey(l);
      R.prev[k] = Math.min(l.qty, receivedQty(b, l));
      R.add[k] = 0;
      R.mode[k] = null;
    }
  },
  view({ id }) {
    const b = getBatch(id);
    if (!b) return `<main class="screen">${topBar(t('receiveTitle'))}${empty(t('noResults'))}</main>`;
    const left = leftToMark(b);
    const open = openLines(b);
    return `<main class="screen">
      ${topBar(t('receiveTitle'))}
      <p class="batch-head">${I.calendar}<b>${esc(fmtDate(b.date, { weekday: 'short', day: 'numeric', month: 'long' }))}</b> · ${esc(dhobiName(b.dhobiId))}</p>

      ${counter(b)}
      ${open.length ? dateRow(b) : ''}

      <div class="section-title recv-title"><span>${esc(t('adjust'))}</span>
        ${open.length && left ? `<button class="link-small tap" data-act="all-came">${I.check}${esc(t('markAllCame'))}</button>` : ''}</div>
      <div class="rlist">${[...open, ...b.lines.filter((l) => remaining(l) <= 0)].map((l) => row(b, l)).join('')}</div>
      ${notBackAlert(b)}
      ${open.length ? `<div class="footer-bar"><button class="btn btn-primary tap" data-act="save" ${left ? 'disabled' : ''}>${left ? esc(t('leftToMark', left)) : `${I.check}${esc(t('saveReceived'))}`}</button></div>` : ''}
    </main>`;
  },
  actions: {
    'all-came'() {
      const b = getBatch(R.id);
      for (const l of openLines(b)) { R.mode[lineKey(l)] = 'yes'; R.add[lineKey(l)] = remaining(l); }
      haptic('medium');
      refresh();
    },
    'pick-mode'(el) {
      const b = getBatch(R.id);
      const k = el.dataset.k;
      const l = b.lines.find((x) => lineKey(x) === k);
      const m = el.dataset.m;
      const rem = remaining(l);
      R.mode[k] = m;
      R.add[k] = m === 'yes' ? rem : m === 'no' ? 0 : Math.max(1, rem - 1);
      if (m === 'no') hapticWarning(); else haptic();
      refresh();
    },
    inc(el) { const b = getBatch(R.id); const l = b.lines.find((x) => lineKey(x) === el.dataset.k); R.add[el.dataset.k] = Math.min(remaining(l) - 1, (R.add[el.dataset.k] || 0) + 1); haptic(); refresh(); },
    dec(el) { R.add[el.dataset.k] = Math.max(1, (R.add[el.dataset.k] || 0) - 1); haptic(); refresh(); },
    'r-date'(el) { R.date = el.dataset.v; haptic(); refresh(); },
    'r-pick-date'(el) { if (el.value) { R.date = el.value; refresh(); } },
    save() { const b = getBatch(R.id); if (!leftToMark(b)) save(b); },
  },
});
