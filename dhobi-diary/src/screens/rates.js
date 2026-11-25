// Rates: one number per item for the chosen service. Saved as you type.
import { screen, refresh } from '../ui/router.js';
import { t } from '../i18n/index.js';
import { I } from '../ui/icons.js';
import { esc, topBar, itemName, itemArt, serviceName, snack, confirmSheet } from '../ui/kit.js';
import { getDB, allItemIds, setRate, resetRates, deleteCustomItem } from '../core/db.js';
import { SERVICES } from '../core/catalog.js';
import { haptic } from '../platform/native.js';

let svc = 'iron';

screen('rates', {
  view() {
    const db = getDB();
    return `<main class="screen">
      ${topBar(t('ratesTitle'))}
      <p class="muted">${esc(t('ratesSub'))}</p>
      <div class="seg-row service-row">
        ${SERVICES.map((s) => `<button class="seg seg-service tap ${svc === s ? 'on' : ''}" data-act="svc" data-v="${s}">${I[s]}<span>${esc(serviceName(s))}</span></button>`).join('')}
      </div>
      <div class="rate-list">
        ${allItemIds().map((id) => `<label class="rate-row">
          <span class="rrow-art">${itemArt(id)}</span>
          <span class="rate-name">${esc(itemName(id))}</span>
          ${id.startsWith('c_') ? `<button class="icon-btn small tap" data-act="del-item" data-id="${id}" aria-label="${esc(t('delete'))}">${I.trash}</button>` : ''}
          <span class="rate-in"><i>₹</i><input type="number" inputmode="numeric" min="0" max="9999" value="${db.rates[id]?.[svc] ?? 0}" data-change="rate" data-id="${id}"></span>
        </label>`).join('')}
      </div>
      <p class="fine">${esc(t('ratesNote'))}</p>
      <button class="btn btn-ghost tap" data-act="reset">${esc(t('resetRates'))}</button>
    </main>`;
  },
  afterRender(el) {
    el.querySelectorAll('.rate-in input').forEach((inp) => inp.addEventListener('focus', () => inp.select()));
  },
  actions: {
    svc(el) { svc = el.dataset.v; haptic(); refresh(); },
    rate(el) { setRate(el.dataset.id, svc, el.value); el.value = getDB().rates[el.dataset.id][svc]; snack(`${t('saved')} · ${itemName(el.dataset.id)}`); },
    reset() { confirmSheet({ title: t('resetRates') + '?', yes: t('ok'), danger: false, onYes: () => { resetRates(); snack(t('ratesReset'), { canUndo: true }); refresh(); } }); },
    'del-item'(el) {
      confirmSheet({ title: `${t('delete')}: ${itemName(el.dataset.id)}?`, yes: t('delete'), onYes: () => { deleteCustomItem(el.dataset.id); refresh(); } });
    },
  },
});
