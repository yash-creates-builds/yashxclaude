// Monthly bill: totals by service, a calendar of dhobi days, bundle list, mark as paid, share.
import { screen, go, refresh } from '../ui/router.js';
import { t, money, fmtMonth, fmtDate } from '../i18n/index.js';
import { I } from '../ui/icons.js';
import { esc, batchCard, tabBar, itemName, serviceName, dhobiName, snack } from '../ui/kit.js';
import { getDB, setPaid, paidKey } from '../core/db.js';
import { monthBill, receivedQty } from '../core/calc.js';
import { thisMonth, shiftMonth, monthOf, today } from '../core/dates.js';
import { SERVICES } from '../core/catalog.js';
import { shareText, haptic, hapticSuccess } from '../platform/native.js';

const B = { month: thisMonth(), dhobi: '' };

function involvedDhobis(list) {
  return B.dhobi ? [B.dhobi] : [...new Set(list.map((b) => b.dhobiId))];
}
const isPaid = (list) => {
  const ids = involvedDhobis(list);
  return ids.length > 0 && ids.every((id) => getDB().paid[paidKey(B.month, id)]);
};

/** Month grid (Mon-first). Days with clothes given are filled; days clothes came back get a dot. */
function calendar(list) {
  const [y, m] = B.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const given = new Set(list.map((b) => Number(b.date.slice(8))));
  const back = new Set(getDB().batches
    .filter((b) => b.receivedDate && monthOf(b.receivedDate) === B.month && (!B.dhobi || b.dhobiId === B.dhobi))
    .map((b) => Number(b.receivedDate.slice(8))));
  const letters = t('weekdayLetters');
  const heads = [1, 2, 3, 4, 5, 6, 0].map((d) => `<span class="cal-h">${esc(letters[d])}</span>`).join('');
  const todayD = monthOf(today()) === B.month ? Number(today().slice(8)) : 0;
  let cells = '<span class="cal-d blank"></span>'.repeat(lead);
  for (let d = 1; d <= days; d++) {
    cells += `<span class="cal-d ${given.has(d) ? 'given' : ''} ${d === todayD ? 'today' : ''}">${d}${back.has(d) ? '<i></i>' : ''}</span>`;
  }
  return `<div class="cal">${heads}${cells}</div>
    <div class="cal-legend"><span><i class="lg-given"></i>${esc(t('dayGiven'))}</span><span><i class="lg-back"></i>${esc(t('dayBack'))}</span></div>`;
}

/** WhatsApp-friendly plain text. */
export function billText() {
  const db = getDB();
  const bill = monthBill(db.batches, B.month, B.dhobi || null);
  const byItem = new Map();
  for (const b of bill.list) {
    for (const l of b.lines) {
      const q = b.received ? Math.min(receivedQty(b, l), l.qty) : l.qty;
      if (!q) continue;
      const k = `${l.itemId}|${l.service}|${l.rate}`;
      byItem.set(k, (byItem.get(k) || 0) + q);
    }
  }
  const lines = [`*${t('shareHeader', fmtMonth(B.month))}*`];
  const names = involvedDhobis(bill.list).map(dhobiName).join(', ');
  if (names) lines.push(names);
  lines.push('');
  for (const [k, q] of byItem) {
    const [itemId, service, rate] = k.split('|');
    lines.push(`${itemName(itemId)} (${serviceName(service)}) × ${q} = ${money(q * Number(rate))}`);
  }
  lines.push('', ...SERVICES.filter((s) => bill.byService[s].qty).map((s) => `${serviceName(s)}: ${bill.byService[s].qty} — ${money(bill.byService[s].amount)}`));
  lines.push('', `*${t('shareTotal')}: ${money(bill.total)}*`);
  if (bill.pendingItems) lines.push(`(${t('billPendingLine', bill.pendingItems)})`);
  if (bill.missingItems) lines.push(`(${t('billMissingLine', bill.missingItems)})`);
  if (isPaid(bill.list)) lines.push(`✅ ${t('paid')}`);
  lines.push('', `— ${t('shareFooter')}`);
  return lines.join('\n');
}

screen('bill', {
  view() {
    const db = getDB();
    const bill = monthBill(db.batches, B.month, B.dhobi || null);
    const paid = isPaid(bill.list);
    const isNow = B.month === thisMonth();
    const grandma = db.settings.grandma;
    return `<main class="screen bill">
      <header class="topbar">${grandma ? `<button class="icon-btn tap" data-act="back" aria-label="${esc(t('back'))}">${I.back}</button>` : '<span class="w-btn"></span>'}<h1 class="topbar-title">${esc(t('billTitle'))}</h1><span class="w-btn"></span></header>

      <div class="month-pick">
        <button class="icon-btn tap" data-act="month" data-d="-1" aria-label="prev">${I.back}</button>
        <b>${esc(fmtMonth(B.month))}</b>
        <button class="icon-btn tap" data-act="month" data-d="1" ${isNow ? 'disabled' : ''} aria-label="next">${I.next}</button>
      </div>

      ${db.dhobis.length > 1 ? `<div class="chips scroll">
        <button class="chip tap ${!B.dhobi ? 'on' : ''}" data-act="dhobi" data-id="">${esc(t('allDhobis'))}</button>
        ${db.dhobis.map((d) => `<button class="chip tap ${B.dhobi === d.id ? 'on' : ''}" data-act="dhobi" data-id="${d.id}">${esc(dhobiName(d.id))}</button>`).join('')}
      </div>` : ''}

      <div class="bill-top"><div class="receipt-wrap"><section class="receipt">
        <span class="total-label">${esc(t('amount'))}</span>
        <b class="total-amt">${money(bill.total)}</b>
        <span class="total-sub">${esc(t('items', bill.items))}${bill.pendingItems ? ` · ${esc(t('billPendingLine', bill.pendingItems))}` : ''}</span>
        ${bill.missingItems ? `<span class="pill pill-red">${I.alert}${esc(t('billMissingLine', bill.missingItems))}</span>` : ''}
        ${paid ? `<span class="stamp">${I.check}${esc(t('paid'))}</span>` : ''}
        <div class="rc-rows">
          ${SERVICES.map((s) => `<div class="rc-row ${bill.byService[s].qty ? '' : 'zero'}">${I[s]}<span>${esc(serviceName(s))}</span><i></i><span class="q">${bill.byService[s].qty} ×</span><b>${money(bill.byService[s].amount)}</b></div>`).join('')}
        </div>
      </section></div></div>

      ${bill.list.length ? `
        <div class="stack">
          <button class="btn ${paid ? 'btn-outline' : 'btn-primary'} tap" data-act="paid">${paid ? esc(t('markUnpaid')) : `${I.check}${esc(t('markPaid'))}`}</button>
          <button class="btn btn-whatsapp tap" data-act="share">${I.share}${esc(t('shareBill'))}</button>
        </div>` : ''}

      ${calendar(bill.list)}

      <h2 class="section-title">${esc(t('nav_history'))}</h2>
      ${bill.list.length ? `<div class="list">${bill.list.map((b) => batchCard(b)).join('')}</div>` : `<p class="calm">${esc(t('noBatchesMonth'))}</p>`}
      <p class="fine">${esc(t('billNote'))}</p>
    </main>${grandma ? '' : tabBar('bill')}`;
  },
  actions: {
    month(el) { B.month = shiftMonth(B.month, Number(el.dataset.d)); haptic(); refresh(); },
    dhobi(el) { B.dhobi = el.dataset.id; haptic(); refresh(); },
    paid() {
      const db = getDB();
      const list = monthBill(db.batches, B.month, B.dhobi || null).list;
      const on = !isPaid(list);
      setPaid(B.month, involvedDhobis(list), on);
      if (on) hapticSuccess();
      snack(on ? t('paid') : t('markUnpaid'), { canUndo: true });
      refresh();
    },
    async share() {
      const r = await shareText(t('shareHeader', fmtMonth(B.month)), billText());
      if (r === 'copied') snack('✓ Copied');
    },
    'open-batch': (el) => go('batch', { id: el.dataset.id }),
  },
});

export const resetBillMonth = () => { B.month = thisMonth(); };
