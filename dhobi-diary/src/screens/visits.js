// Dhobi visits ("attendance"): date, day and time each time the dhobi comes to the house.
import { screen, refresh, openSheet, closeSheet, render } from '../ui/router.js';
import { t, fmtDate, fmtMonth, locale } from '../i18n/index.js';
import { I } from '../ui/icons.js';
import { esc, topBar, dhobiName, snack, confirmSheet, empty } from '../ui/kit.js';
import { getDB, addVisit, deleteVisit, sortedVisits } from '../core/db.js';
import { today, monthOf } from '../core/dates.js';
import { haptic, hapticSuccess } from '../platform/native.js';

const pad = (n) => String(n).padStart(2, '0');
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function fmtTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
}
export const fmtVisit = (v) => `${fmtDate(v.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(v.time)}`;
export const lastVisit = () => sortedVisits()[0] || null;

/** Sheet: today + now are filled in; one tap saves. Date and time can be changed. */
export function openVisitSheet() {
  const db = getDB();
  const V = { date: today(), time: nowTime(), dhobiId: db.settings.lastDhobiId || db.dhobis[0].id };
  if (!db.dhobis.some((d) => d.id === V.dhobiId)) V.dhobiId = db.dhobis[0].id;
  const view = () => `
    <h2 class="sheet-title">${I.user} ${esc(t('dhobiCame'))}</h2>
    <div class="visit-now">
      <span class="visit-day">${esc(fmtDate(V.date, { weekday: 'long' }))}</span>
      <div class="visit-fields">
        <label class="visit-field">${I.calendar}<input type="date" id="visit-date" value="${V.date}" max="${today()}" data-change="v-date" aria-label="${esc(t('date'))}"><span>${esc(fmtDate(V.date, { day: 'numeric', month: 'long', year: 'numeric' }))}</span></label>
        <label class="visit-field">${I.history}<input type="time" id="visit-time" value="${V.time}" data-change="v-time" aria-label="${esc(t('time'))}"><span>${esc(fmtTime(V.time))}</span></label>
      </div>
    </div>
    ${db.dhobis.length > 1 ? `<div class="chips">${db.dhobis.map((d) => `<button class="chip tap ${V.dhobiId === d.id ? 'on' : ''}" data-act="v-dhobi" data-id="${d.id}">${I.user}${esc(dhobiName(d.id))}</button>`).join('')}</div>` : ''}
    <div class="sheet-actions">
      <button class="btn btn-primary tap" data-act="v-save">${I.check}${esc(t('markVisit'))}</button>
      <button class="btn btn-ghost tap" data-act="sheet-close">${esc(t('cancel'))}</button>
    </div>`;
  const redraw = () => { document.querySelector('#sheet .sheet').innerHTML = view(); };
  openSheet(view, {
    'v-date': (el) => { if (el.value) { V.date = el.value; redraw(); } },
    'v-time': (el) => { if (el.value) { V.time = el.value; redraw(); } },
    'v-dhobi': (el) => { V.dhobiId = el.dataset.id; haptic(); redraw(); },
    'v-save': () => {
      const v = addVisit(V);
      closeSheet();
      hapticSuccess();
      snack(`${t('visitMarked')} · ${fmtVisit(v)}`, { canUndo: true });
      render();
    },
  });
}

function row(v) {
  const db = getDB();
  const [, , d] = v.date.split('-');
  return `<div class="visit-row">
    <span class="batch-date"><b>${Number(d)}</b><small>${esc(fmtDate(v.date, { weekday: 'short' }))}</small></span>
    <span class="batch-main">
      <span class="batch-title">${esc(fmtTime(v.time))}</span>
      <span class="batch-sub">${esc(fmtDate(v.date, { day: 'numeric', month: 'long' }))}${db.dhobis.length > 1 ? ` · ${esc(dhobiName(v.dhobiId))}` : ''}${v.by ? ` · ${esc(t('byName', v.by))}` : ''}</span>
    </span>
    <button class="icon-btn small tap" data-act="del-visit" data-id="${v.id}" aria-label="${esc(t('delete'))}">${I.trash}</button>
  </div>`;
}

/** Visits for one month (used by the bill screen). */
export function visitList(ym, dhobiId = null) {
  const list = sortedVisits().filter((v) => monthOf(v.date) === ym && (!dhobiId || v.dhobiId === dhobiId));
  return list;
}
export const visitRows = (list) => `<div class="list">${list.map(row).join('')}</div>`;

export const visitActions = {
  'del-visit': (el) => confirmSheet({
    title: t('deleteVisit'), sub: t('confirmDeleteSub'), yes: t('delete'),
    onYes: () => { deleteVisit(el.dataset.id); snack(t('deleted'), { canUndo: true }); refresh(); },
  }),
  'mark-visit': () => openVisitSheet(),
};

screen('visits', {
  view() {
    const all = sortedVisits();
    const months = [...new Set(all.map((v) => monthOf(v.date)))];
    return `<main class="screen">
      ${topBar(t('visitsTitle'))}
      <button class="big-action visit tap" data-act="mark-visit">
        <span class="big-ic">${I.user}</span>
        <span class="big-txt"><b>${esc(t('dhobiCame'))}</b><small>${esc(t('dhobiCameSub'))}</small></span>
      </button>
      ${all.length ? months.map((m) => {
        const list = all.filter((v) => monthOf(v.date) === m);
        return `<h2 class="section-title">${esc(fmtMonth(m))} · ${esc(t('visitsCount', list.length))}</h2>${visitRows(list)}`;
      }).join('') : empty(t('noVisits'))}
    </main>`;
  },
  actions: visitActions,
});

