// "Give clothes": pick date + dhobi + service, tap + on each item. Also used to edit a pending bundle.
import { screen, go, back, refresh, S } from '../ui/router.js';
import { t, money, fmtDate } from '../i18n/index.js';
import { I } from '../ui/icons.js';
import { esc, topBar, itemName, itemArt, serviceName, dhobiName, snack, promptSheet, confirmSheet } from '../ui/kit.js';
import { getDB, allItemIds, addBatch, updateBatch, getBatch, addDhobi, addCustomItem } from '../core/db.js';
import { SERVICES } from '../core/catalog.js';
import { today, daysAgo } from '../core/dates.js';
import { haptic, hapticSuccess } from '../platform/native.js';

let G = null; // form state

const key = (itemId, service) => `${itemId}|${service}`;
const total = () => Object.values(G.counts).reduce((s, n) => s + n, 0);
const rateOf = (k) => {
  const [itemId, service] = k.split('|');
  return G.frozen[k] ?? getDB().rates[itemId]?.[service] ?? 0;
};
const estimate = () => Object.entries(G.counts).reduce((s, [k, n]) => s + n * rateOf(k), 0);

function start(params) {
  const db = getDB();
  const b = params.id ? getBatch(params.id) : null;
  G = {
    editId: b?.id || null,
    date: b?.date || today(),
    dhobiId: b?.dhobiId || db.settings.lastDhobiId || db.dhobis[0].id,
    service: b?.lines[0]?.service || db.settings.lastService || 'iron',
    counts: {}, frozen: {}, note: b?.note || '',
  };
  if (!db.dhobis.some((d) => d.id === G.dhobiId)) G.dhobiId = db.dhobis[0].id;
  for (const l of b?.lines || []) { G.counts[key(l.itemId, l.service)] = l.qty; G.frozen[key(l.itemId, l.service)] = l.rate; }
}

function tile(itemId) {
  const n = G.counts[key(itemId, G.service)] || 0;
  const others = SERVICES.filter((s) => s !== G.service && G.counts[key(itemId, s)])
    .map((s) => `<span class="mini">${esc(serviceName(s))} ${G.counts[key(itemId, s)]}</span>`).join('');
  return `<div class="tile ${itemId === 'pieces' ? 'tile-pieces' : ''} ${n ? 'on' : ''}" id="tile-${itemId}">
    <button class="tile-face tap" data-act="inc" data-item="${itemId}" aria-label="${esc(itemName(itemId))} +1">
      <span class="tile-art">${itemArt(itemId)}</span>
      <span class="tile-name">${esc(itemName(itemId))}</span>${itemId === 'pieces' ? `<small class="tile-hint">${esc(t('piecesHint'))}</small>` : ''}
      ${others ? `<span class="tile-others">${others}</span>` : ''}
    </button>
    <div class="counter">
      <button class="cnt-btn tap" data-act="dec" data-item="${itemId}" ${n ? '' : 'disabled'} aria-label="−1">${I.minus}</button>
      <output class="cnt" aria-live="polite">${n}</output>
      <button class="cnt-btn plus tap" data-act="inc" data-item="${itemId}" aria-label="+1">${I.plus}</button>
    </div>
  </div>`;
}

function footer() {
  const n = total();
  return `<div class="footer-bar" id="give-footer">
    <div class="footer-sum">
      <span><small>${esc(t('total'))}</small><b>${esc(t('items', n))}</b></span>
      <span><small>${esc(t('estimate'))}</small><b>${money(estimate())}</b></span>
    </div>
    <button class="btn btn-primary btn-save tap" data-act="save" ${n ? '' : 'disabled'}>${I.check}${esc(t('save'))}</button>
  </div>`;
}

function dateRow() {
  const isToday = G.date === today();
  const isYday = G.date === daysAgo(1);
  const other = !isToday && !isYday;
  return `<div class="seg-row" role="group" aria-label="${esc(t('date'))}">
    <button class="seg tap ${isToday ? 'on' : ''}" data-act="date" data-v="${today()}">${esc(t('today'))}</button>
    <button class="seg tap ${isYday ? 'on' : ''}" data-act="date" data-v="${daysAgo(1)}">${esc(t('yesterday'))}</button>
    <label class="seg tap seg-date ${other ? 'on' : ''}">${I.calendar}<span>${esc(other ? fmtDate(G.date) : t('pickDate'))}</span>
      <input type="date" data-change="pick-date" value="${G.date}" max="${today()}"></label>
  </div>`;
}

function updateInPlace(itemId) {
  document.getElementById('tile-' + itemId).outerHTML = tile(itemId);
  document.getElementById('give-footer').outerHTML = footer();
  document.querySelector(`#tile-${itemId} .cnt`)?.classList.add('bump');
}

screen('give', {
  onEnter: start,
  canLeave() {
    if (!G || !total() || G.leaving) return true;
    confirmSheet({ title: t('cancel') + '?', sub: t('items', total()), yes: t('cancel'), onYes: () => { G.leaving = true; back(); } });
    return false;
  },
  view() {
    const db = getDB();
    const ids = allItemIds();
    return `<main class="screen give ${db.settings.grandma ? 'is-grandma' : ''}">
      ${topBar(G.editId ? t('editBatch') : t('give'))}

      <section class="form-block">
        <h2 class="label">${esc(t('date'))}</h2>
        ${dateRow()}
      </section>

      <section class="form-block">
        <h2 class="label">${esc(t('whichDhobi'))}</h2>
        <div class="chips">
          ${db.dhobis.map((d) => `<button class="chip tap ${G.dhobiId === d.id ? 'on' : ''}" data-act="dhobi" data-id="${d.id}">${I.user}${esc(dhobiName(d.id))}</button>`).join('')}
          <button class="chip chip-add tap" data-act="add-dhobi">${I.plus}${esc(t('addDhobi'))}</button>
        </div>
      </section>

      <section class="form-block sticky-service">
        <h2 class="label">${esc(t('service'))}</h2>
        <div class="seg-row service-row" role="tablist">
          ${SERVICES.map((s) => `<button class="seg seg-service tap ${G.service === s ? 'on' : ''}" role="tab" aria-selected="${G.service === s}" data-act="service" data-v="${s}">${I[s]}<span>${esc(serviceName(s))}</span></button>`).join('')}
        </div>
      </section>

      <section class="grid">${ids.filter((id) => id !== 'pieces').map(tile).join('')}
        <button class="tile tile-add tap" data-act="add-item"><span class="tile-art">${itemArt('other')}</span><span class="tile-name">${esc(t('i_other'))}</span><small>${esc(t('otherHint'))}</small></button>
        ${tile('pieces')}
      </section>

      <section class="form-block">
        <input class="field" placeholder="${esc(t('note'))}" value="${esc(G.note)}" data-input="note" maxlength="80">
      </section>
      ${footer()}
    </main>`;
  },
  actions: {
    inc(el) {
      const k = key(el.dataset.item, G.service);
      G.counts[k] = Math.min(99, (G.counts[k] || 0) + 1);
      haptic();
      updateInPlace(el.dataset.item);
    },
    dec(el) {
      const k = key(el.dataset.item, G.service);
      if (!G.counts[k]) return;
      G.counts[k] -= 1;
      if (!G.counts[k]) delete G.counts[k];
      haptic();
      updateInPlace(el.dataset.item);
    },
    service(el) { G.service = el.dataset.v; haptic(); refresh(); },
    date(el) { G.date = el.dataset.v; haptic(); refresh(); },
    'pick-date'(el) { if (el.value) { G.date = el.value; refresh(); } },
    dhobi(el) { G.dhobiId = el.dataset.id; haptic(); refresh(); },
    note(el) { G.note = el.value; },
    'add-dhobi'() {
      promptSheet({ title: t('addDhobi'), placeholder: t('name'), onOk: (name) => { G.dhobiId = addDhobi(name).id; refresh(); } });
    },
    'add-item'() {
      promptSheet({
        title: t('addItem'), placeholder: t('itemName'),
        onOk: (name) => {
          const c = addCustomItem(name);
          G.counts[key(c.id, G.service)] = 1;
          refresh();
          document.getElementById('tile-' + c.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        },
      });
    },
    save() {
      const lines = Object.entries(G.counts).map(([k, qty]) => {
        const [itemId, service] = k.split('|');
        return { itemId, service, qty };
      });
      if (!lines.length) return;
      const db = getDB();
      db.settings.lastDhobiId = G.dhobiId;
      db.settings.lastService = G.service;
      if (G.editId) {
        const rates = getDB().rates;
        updateBatch(G.editId, {
          date: G.date, dhobiId: G.dhobiId, note: G.note,
          lines: lines.map((l) => ({ ...l, rate: G.frozen[key(l.itemId, l.service)] ?? rates[l.itemId]?.[l.service] ?? 0 })),
        });
      } else {
        addBatch({ dhobiId: G.dhobiId, date: G.date, lines, note: G.note });
      }
      hapticSuccess();
      G.leaving = true;
      snack(`${t('saved')} · ${t('items', total())}`, { canUndo: true });
      go('home', {}, { reset: true });
    },
  },
});
