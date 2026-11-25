// Shared bits of UI: escaping, headers, pills, snackbar, confirm sheet.
import { t, fmtDate, money } from '../i18n/index.js';
import { I } from './icons.js';
import { art } from './art.js';
import { getDB, customItem, undo } from '../core/db.js';
import { statusOf, missingOf, givenCount, charge } from '../core/calc.js';
import { openSheet, closeSheet, refresh } from './router.js';
import { haptic } from '../platform/native.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const itemName = (id) => (id.startsWith('c_') ? customItem(id)?.name || t('i_other') : t('i_' + id));
export const itemArt = (id) => art(id.startsWith('c_') ? 'other' : id);
export const serviceName = (s) => t('s_' + s);
export const dhobiName = (id) => {
  const db = getDB();
  const d = db.dhobis.find((x) => x.id === id);
  if (!d) return t('dhobi');
  if (d.name) return d.name;
  const unnamed = db.dhobis.filter((x) => !x.name);
  return unnamed.length > 1 ? `${t('dhobi')} ${unnamed.indexOf(d) + 1}` : t('dhobi');
};
export const statusName = (s) => t('st_' + s);

/** "1 Kurta, 2 Shirt" */
export const missingText = (b) => missingOf(b).map((m) => `${m.qty} ${itemName(m.itemId)}`).join(', ');

export function topBar(title, { backBtn = true, right = '' } = {}) {
  return `<header class="topbar">
    ${backBtn ? `<button class="icon-btn tap" data-act="back" aria-label="${esc(t('back'))}">${I.back}</button>` : '<span class="w-btn"></span>'}
    <h1 class="topbar-title">${esc(title)}</h1>
    ${right || '<span class="w-btn"></span>'}
  </header>`;
}

export function statusPill(b) {
  const st = statusOf(b);
  if (st === 'partial') return `<span class="pill pill-red">${I.alert}${esc(t('missingAlert', String(missingOf(b).reduce((s, m) => s + m.qty, 0))))}</span>`;
  return `<span class="pill pill-${st}">${st === 'received' ? I.check : ''}${esc(statusName(st))}</span>`;
}

/** One bundle row: date block · dhobi + count · status. */
export function batchCard(b, act = 'open-batch') {
  const [, , d] = b.date.split('-');
  const services = [...new Set(b.lines.map((l) => serviceName(l.service)))].join(' · ');
  return `<button class="batch tap" data-act="${act}" data-id="${b.id}">
    <span class="batch-date"><b>${Number(d)}</b><small>${esc(fmtDate(b.date, { month: 'short' }))}</small></span>
    <span class="batch-main">
      <span class="batch-title">${esc(dhobiName(b.dhobiId))} · ${esc(t('items', givenCount(b)))}</span>
      <span class="batch-sub">${esc(services)} · ${money(charge(b))}</span>
      ${statusPill(b)}
    </span>
    <span class="batch-go">${I.next}</span>
  </button>`;
}

export const empty = (text) => `<div class="empty">${itemArt('other')}<p>${esc(text)}</p></div>`;

/* ------------------------------------------------------- snackbar with undo */
let snackTimer = 0;
let snackAt = 0;
export function hideSnackOnNavigate() {
  if (Date.now() - snackAt > 900) document.getElementById('snack').className = 'snack';
}
export function snack(text, { canUndo = false, tone = '' } = {}) {
  const el = document.getElementById('snack');
  clearTimeout(snackTimer);
  snackAt = Date.now();
  // Sit above the tab bar / footer only when there is one.
  requestAnimationFrame(() => { el.classList.toggle('low', !document.querySelector('#app .tabbar, #app .footer-bar')); });
  el.className = `snack show ${tone}`;
  el.innerHTML = `<span>${esc(text)}</span>${canUndo ? `<button class="snack-undo tap" id="snack-undo">${esc(t('undo'))}</button>` : ''}`;
  el.querySelector('#snack-undo')?.addEventListener('click', () => {
    haptic('medium');
    if (undo()) { snack(t('undo') + ' ✓'); refresh(); }
  });
  snackTimer = setTimeout(() => { el.className = 'snack'; }, canUndo ? 6000 : 2500);
}

/* ------------------------------------------------------- confirm sheet */
export function confirmSheet({ title, sub = '', yes, danger = true, onYes }) {
  openSheet(() => `
    <h2 class="sheet-title">${esc(title)}</h2>
    ${sub ? `<p class="sheet-sub">${esc(sub)}</p>` : ''}
    <div class="sheet-actions">
      <button class="btn btn-${danger ? 'danger' : 'primary'} tap" data-act="yes">${esc(yes)}</button>
      <button class="btn btn-ghost tap" data-act="sheet-close">${esc(t('cancel'))}</button>
    </div>`, { yes: () => { closeSheet(); onYes(); } });
}

/** Sheet with one text field. */
export function promptSheet({ title, placeholder = '', value = '', okLabel, onOk }) {
  openSheet(() => `
    <h2 class="sheet-title">${esc(title)}</h2>
    <input class="field" id="prompt-in" maxlength="40" placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="off" enterkeyhint="done">
    <div class="sheet-actions">
      <button class="btn btn-primary tap" data-act="ok">${esc(okLabel || t('save'))}</button>
      <button class="btn btn-ghost tap" data-act="sheet-close">${esc(t('cancel'))}</button>
    </div>`, {
    ok: () => {
      const v = document.getElementById('prompt-in').value.trim();
      if (!v) return;
      closeSheet();
      onOk(v);
    },
  });
  const inp = document.getElementById('prompt-in');
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.querySelector('.sheet [data-act="ok"]').click(); } });
}

/** Bottom navigation (hidden in Grandma Mode). */
export function tabBar(active) {
  const tabs = [['home', I.home, 'nav_home'], ['history', I.history, 'nav_history'], ['bill', I.bill, 'nav_bill'], ['more', I.more, 'nav_more']];
  return `<nav class="tabbar">${tabs.map(([id, ic, key]) => `
    <button class="tab tap ${active === id ? 'on' : ''}" data-act="tab" data-to="${id}" aria-current="${active === id ? 'page' : 'false'}">${ic}<span>${esc(t(key))}</span></button>`).join('')}</nav>`;
}
