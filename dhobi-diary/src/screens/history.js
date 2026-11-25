// History: search + filter by dhobi, month and status.
import { screen, go, refresh } from '../ui/router.js';
import { t, fmtMonth } from '../i18n/index.js';
import { I } from '../ui/icons.js';
import { esc, batchCard, tabBar, itemName, dhobiName, serviceName, statusName, empty } from '../ui/kit.js';
import { getDB } from '../core/db.js';
import { statusOf } from '../core/calc.js';
import { monthOf } from '../core/dates.js';

const F = { q: '', dhobi: '', month: '', status: '' };

function matches(b) {
  if (F.dhobi && b.dhobiId !== F.dhobi) return false;
  if (F.month && monthOf(b.date) !== F.month) return false;
  if (F.status && statusOf(b) !== F.status) return false;
  if (!F.q) return true;
  const hay = [dhobiName(b.dhobiId), b.note, b.date, statusName(statusOf(b)),
    ...b.lines.flatMap((l) => [itemName(l.itemId), serviceName(l.service)])].join(' ').toLowerCase();
  return F.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function results() {
  const list = getDB().batches.filter(matches)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  return list.length ? `<div class="list">${list.map((b) => batchCard(b)).join('')}</div>` : empty(t('noResults'));
}

screen('history', {
  view() {
    const db = getDB();
    const months = [...new Set(db.batches.map((b) => monthOf(b.date)))].sort().reverse();
    const chip = (field, value, label) => `<button class="chip tap ${F[field] === value ? 'on' : ''}" data-act="filter" data-f="${field}" data-v="${value}">${esc(label)}</button>`;
    return `<main class="screen">
      <header class="topbar"><span class="w-btn"></span><h1 class="topbar-title">${esc(t('historyTitle'))}</h1><span class="w-btn"></span></header>
      <label class="search">${I.search}<input type="search" placeholder="${esc(t('search'))}" value="${esc(F.q)}" data-input="q" enterkeyhint="search"></label>
      <div class="chips scroll">
        ${chip('status', '', t('all'))}${chip('status', 'pending', t('st_pending'))}${chip('status', 'partial', t('st_partial'))}${chip('status', 'received', t('st_received'))}
      </div>
      ${db.dhobis.length > 1 ? `<div class="chips scroll">${chip('dhobi', '', t('allDhobis'))}${db.dhobis.map((d) => chip('dhobi', d.id, dhobiName(d.id))).join('')}</div>` : ''}
      <label class="select">${I.calendar}<select data-change="month" aria-label="${esc(t('month'))}">
        <option value="">${esc(t('anyMonth'))}</option>
        ${months.map((m) => `<option value="${m}" ${F.month === m ? 'selected' : ''}>${esc(fmtMonth(m))}</option>`).join('')}
      </select></label>
      <div id="results">${results()}</div>
    </main>${tabBar('history')}`;
  },
  actions: {
    q(el) { F.q = el.value.trim(); document.getElementById('results').innerHTML = results(); },
    filter(el) { F[el.dataset.f] = el.dataset.v; refresh(); },
    month(el) { F.month = el.value; refresh(); },
    'open-batch': (el) => go('batch', { id: el.dataset.id }),
  },
});
