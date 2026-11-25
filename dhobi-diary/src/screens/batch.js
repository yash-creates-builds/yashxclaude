// Bundle details: what was given, what came back, what is missing.
import { screen, go, S } from '../ui/router.js';
import { t, money, fmtDate } from '../i18n/index.js';
import { I } from '../ui/icons.js';
import { esc, topBar, itemName, itemArt, serviceName, dhobiName, statusPill, missingText, empty, snack, confirmSheet } from '../ui/kit.js';
import { getBatch, deleteBatch } from '../core/db.js';
import { statusOf, receivedQty, charge, givenCount } from '../core/calc.js';

screen('batch', {
  view({ id }) {
    const b = getBatch(id);
    if (!b) return `<main class="screen">${topBar(t('batch'))}${empty(t('noResults'))}</main>`;
    const st = statusOf(b);
    return `<main class="screen">
      ${topBar(t('batch'))}
      <div class="detail-head">
        <div><b>${esc(fmtDate(b.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }))}</b><span>${esc(dhobiName(b.dhobiId))}</span></div>
        ${statusPill(b)}
      </div>
      ${st === 'partial' ? `<div class="alert alert-red big" role="alert">${I.alert}<span><b>${esc(t('missingTitle'))}</b>${esc(t('missingAlert', missingText(b)))}</span></div>` : ''}
      ${b.receivedDate ? `<p class="muted">${esc(t('receivedOn'))}: ${esc(fmtDate(b.receivedDate))}</p>` : ''}
      ${b.note ? `<p class="note">“${esc(b.note)}”</p>` : ''}

      <div class="table">
        <div class="tr th"><span></span><span>${esc(t('given'))}</span><span>${esc(t('got'))}</span><span>₹</span></div>
        ${b.lines.map((l) => {
          const got = b.received ? Math.min(receivedQty(b, l), l.qty) : null;
          const billed = got == null ? l.qty : got;
          return `<div class="tr ${got != null && got < l.qty ? 'short' : ''}">
            <span class="td-item">${itemArt(l.itemId)}<span><b>${esc(itemName(l.itemId))}</b><small>${esc(serviceName(l.service))} · ${money(l.rate)}</small></span></span>
            <span>${l.qty}</span><span>${got == null ? '–' : got}</span><span>${money(billed * l.rate)}</span>
          </div>`;
        }).join('')}
        <div class="tr tf"><span>${esc(t('total'))}</span><span>${givenCount(b)}</span><span></span><span>${money(charge(b))}</span></div>
      </div>

      <div class="stack">
        ${st !== 'received' ? `<button class="btn btn-primary tap" data-act="receive">${I.receive}${esc(st === 'partial' ? t('receiveRest') : t('receive'))}</button>` : ''}
        ${st === 'pending' ? `<button class="btn btn-outline tap" data-act="edit">${I.edit}${esc(t('editBatch'))}</button>` : ''}
        <button class="btn btn-ghost danger-text tap" data-act="delete">${I.trash}${esc(t('deleteBatch'))}</button>
      </div>
    </main>`;
  },
  actions: {
    receive: () => go('receiveBatch', { id: getBatchId() }),
    edit: () => go('give', { id: getBatchId() }),
    delete() {
      confirmSheet({
        title: t('confirmDelete'), sub: t('confirmDeleteSub'), yes: t('delete'),
        onYes: () => { deleteBatch(getBatchId()); snack(t('deleted'), { canUndo: true }); go('home', {}, { reset: true }); },
      });
    },
  },
});

const getBatchId = () => S.route.params.id;
