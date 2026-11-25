import { screen, go, render } from '../ui/router.js';
import { t, money, LANGS, getLang, fmtDate } from '../i18n/index.js';
import { I } from '../ui/icons.js';
import { esc, batchCard, tabBar, snack } from '../ui/kit.js';
import { getDB, addVisit, sortedVisits } from '../core/db.js';
import { statusOf, givenCount, receivedCount, monthBill, missingOf } from '../core/calc.js';
import { thisMonth, today } from '../core/dates.js';
import { hapticSuccess } from '../platform/native.js';
import { openLangSheet } from './settings.js';
import { openVisitSheet, fmtTime, fmtVisit } from './visits.js';
import { family } from '../features/sharing/index.js';

/** Small line under the title when this phone is in a family diary. */
export function syncChip() {
  if (!getDB().settings.family) return '';
  const s = family.status;
  const label = s.status === 'removed' ? t('removedSync') : s.status === 'synced' ? t('synced') : t('offlineSync');
  const n = s.members.length;
  return `<button class="sync-chip sync-${s.status} tap" data-act="family">${I.family}<span>${esc(label)}${n ? ` · ${esc(t('people', n))}` : ''}</span></button>`;
}

/** The attendance button: one tap marks "dhobi came" with today's date, day and time. */
function attendButton(big = false) {
  const v = sortedVisits().find((x) => x.date === today());
  const cls = `attend ${big ? 'attend-big' : ''} tap`;
  if (v) {
    return `<button class="${cls} done" data-act="visits">
      <span class="attend-ic">${I.check}</span>
      <span class="attend-txt"><b>${esc(t('markedToday'))}</b><small>${esc(fmtTime(v.time))} · ${esc(t('tapToSee'))}</small></span>
    </button>`;
  }
  return `<button class="${cls}" data-act="attend">
    <span class="attend-ic">${I.thumbsUp}</span>
    <span class="attend-txt"><b>${esc(t('dhobiCame'))}</b><small>${esc(t('tapToMark'))}</small></span>
  </button>`;
}

function summary() {
  const db = getDB();
  const open = db.batches.filter((b) => statusOf(b) !== 'received')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  const out = open.reduce((s, b) => s + (b.received ? givenCount(b) - receivedCount(b) : givenCount(b)), 0);
  const missing = db.batches.reduce((s, b) => s + missingOf(b).reduce((x, m) => x + m.qty, 0), 0);
  const bill = monthBill(db.batches, thisMonth());
  return { open, out, missing, bill };
}

function langChip() {
  const l = LANGS.find((x) => x.id === getLang());
  return `<button class="chip-lang tap" data-act="lang" aria-label="${esc(t('language'))}">${I.lang}<span>${esc(l.label)}</span></button>`;
}

function grandmaHome() {
  const { out, bill } = summary();
  return `<main class="screen home grandma-home">
    <header class="home-head"><h1 class="brand">${esc(t('appName'))}</h1>${langChip()}</header>
    ${syncChip()}
    ${attendButton(true)}
    <button class="mega mega-give tap" data-act="give">${I.give}<span>${esc(t('give'))}</span></button>
    <button class="mega mega-receive tap" data-act="receive">${I.receive}<span>${esc(t('receive'))}</span>${out ? `<em>${esc(t('withDhobi'))}: ${out}</em>` : ''}</button>
    <button class="mega mega-bill tap" data-act="bill">${I.bill}<span>${esc(t('billTitle'))}</span><em>${money(bill.total)}</em></button>
    <button class="link-btn tap" data-act="more">${I.more}${esc(t('exitGrandma'))}</button>
  </main>`;
}

screen('home', {
  view() {
    if (getDB().settings.grandma) return grandmaHome();
    const { open, out, missing, bill } = summary();
    return `<main class="screen home">
      <header class="home-head"><h1 class="brand"><span class="home-date">${esc(fmtDate(today(), { weekday: 'long', day: 'numeric', month: 'long' }))}</span>${esc(t('appName'))}</h1>${langChip()}</header>
      ${syncChip()}
      ${attendButton()}

      <section class="stats" aria-label="summary">
        <div class="stat"><span><i class="key key-sky"></i>${esc(t('withDhobi'))}</span><b>${out}</b></div>
        <button class="stat stat-link tap" data-act="bill" aria-label="${esc(t('seeBill'))}"><span>${esc(t('thisMonth'))} ${I.next}</span><b>${money(bill.total)}</b></button>
        <div class="stat ${missing ? 'stat-red' : ''}"><span><i class="key key-red"></i>${esc(t('missing'))}</span><b>${missing}</b></div>
      </section>

      <button class="big-action give tap" data-act="give">
        <span class="big-ic">${I.give}</span>
        <span class="big-txt"><b>${esc(t('give'))}</b><small>${esc(t('giveSub'))}</small></span>
      </button>
      <button class="big-action receive tap" data-act="receive">
        <span class="big-ic">${I.receive}</span>
        <span class="big-txt"><b>${esc(t('receive'))}</b><small>${esc(t('receiveSub'))}</small></span>
        ${open.length ? `<span class="badge">${open.length}</span>` : ''}
      </button>

      <h2 class="section-title">${esc(t('pendingTitle'))}</h2>
      ${open.length
        ? `<div class="list">${open.map((b) => batchCard(b, 'receive-batch')).join('')}</div>`
        : `<p class="calm">${I.check}<span>${esc(t('nothingPending'))}</span></p>`}
    </main>${tabBar('home')}`;
  },
  actions: {
    give: () => go('give', {}),
    receive: () => go('receive', {}),
    'receive-batch': (el) => go('receiveBatch', { id: el.dataset.id }),
    bill: () => go('bill', {}),
    more: () => go('more', {}),
    lang: () => openLangSheet(),
    visit: () => openVisitSheet(),
    attend() {
      const db = getDB();
      if (db.dhobis.length > 1) return openVisitSheet(); // ask which dhobi
      const d = new Date();
      const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const v = addVisit({ dhobiId: db.dhobis[0].id, date: today(), time });
      hapticSuccess();
      snack(`${t('visitMarked')} · ${fmtVisit(v)}`, { canUndo: true });
      render();
    },
    visits: () => go('visits', {}),
    family: () => go('more', {}),
  },
});
