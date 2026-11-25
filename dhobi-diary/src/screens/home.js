import { screen, go } from '../ui/router.js';
import { t, money, LANGS, getLang } from '../i18n/index.js';
import { I } from '../ui/icons.js';
import { esc, batchCard, tabBar } from '../ui/kit.js';
import { getDB } from '../core/db.js';
import { statusOf, givenCount, receivedCount, monthBill, missingOf } from '../core/calc.js';
import { thisMonth } from '../core/dates.js';
import { openLangSheet } from './settings.js';

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
      <header class="home-head"><h1 class="brand">${esc(t('appName'))}</h1>${langChip()}</header>

      <section class="stats" aria-label="summary">
        <div class="stat"><span>${esc(t('withDhobi'))}</span><b>${out}</b></div>
        <div class="stat"><span>${esc(t('thisMonth'))}</span><b>${money(bill.total)}</b></div>
        <div class="stat ${missing ? 'stat-red' : ''}"><span>${esc(t('missing'))}</span><b>${missing}</b></div>
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

      <button class="bill-card tap" data-act="bill">
        <span><small>${esc(t('billTitle'))}</small><b>${money(bill.total)}</b><small>${esc(t('items', bill.items))}</small></span>
        <span class="bill-go">${esc(t('seeBill'))} ${I.next}</span>
      </button>
    </main>${tabBar('home')}`;
  },
  actions: {
    give: () => go('give', {}),
    receive: () => go('receive', {}),
    'receive-batch': (el) => go('receiveBatch', { id: el.dataset.id }),
    bill: () => go('bill', {}),
    more: () => go('more', {}),
    lang: () => openLangSheet(),
  },
});
