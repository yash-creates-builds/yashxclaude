// Settings: family diary, language, Grandma Mode, rates, dhobis, backup.
import { screen, go, refresh, render, openSheet, closeSheet } from '../ui/router.js';
import { t, LANGS, getLang, setLang } from '../i18n/index.js';
import { I } from '../ui/icons.js';
import { esc, tabBar, dhobiName, serviceName, statusName, itemName, snack, promptSheet, confirmSheet } from '../ui/kit.js';
import { getDB, setSetting, addDhobi, renameDhobi, deleteDhobi } from '../core/db.js';
import { exportCSV, backupJSON, readBackupFile, applyBackup } from '../features/backup.js';
import { haptic } from '../platform/native.js';
import { familyCard, familyActions } from './family.js';

export function applyLang(id) {
  setSetting('lang', id);
  setLang(id);
}

export function applyGrandma(on) {
  document.documentElement.classList.toggle('grandma', !!on);
}

export function openLangSheet() {
  openSheet(() => `
    <h2 class="sheet-title">${I.lang} ${esc(t('chooseLang'))}</h2>
    <div class="stack">${LANGS.map((l) => `<button class="btn ${getLang() === l.id ? 'btn-primary' : 'btn-outline'} btn-lang tap" data-act="pick" data-id="${l.id}" lang="${l.id}">${esc(l.label)}</button>`).join('')}</div>`, {
    pick: (el) => { applyLang(el.dataset.id); closeSheet(); haptic(); render(); },
  });
}

const row = (act, icon, label, sub = '', extra = '') => `<button class="row tap" data-act="${act}" ${extra}>
  <span class="row-ic">${icon}</span><span class="row-txt"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="row-go">${I.next}</span></button>`;

screen('more', {
  view() {
    const db = getDB();
    const s = db.settings;
    const days = t('weekdays');
    return `<main class="screen settings">
      <header class="topbar">${s.grandma ? `<button class="icon-btn tap" data-act="back" aria-label="${esc(t('back'))}">${I.back}</button>` : '<span class="w-btn"></span>'}<h1 class="topbar-title">${esc(t('moreTitle'))}</h1><span class="w-btn"></span></header>

      <h2 class="section-title" id="family">${I.family}${esc(t('family'))}</h2>
      <p class="muted">${esc(t('familySub'))}</p>
      ${familyCard()}

      <h2 class="section-title">${I.lang}${esc(t('language'))}</h2>
      <div class="seg-row">${LANGS.map((l) => `<button class="seg tap ${getLang() === l.id ? 'on' : ''}" data-act="lang" data-id="${l.id}" lang="${l.id}">${esc(l.label)}</button>`).join('')}</div>

      <div class="card toggle-card">
        <span class="row-ic">${I.grandma}</span>
        <span class="row-txt"><b>${esc(t('grandma'))}</b><small>${esc(t('grandmaSub'))}</small></span>
        <button class="switch tap ${s.grandma ? 'on' : ''}" role="switch" aria-checked="${!!s.grandma}" data-act="grandma" aria-label="${esc(t('grandma'))}"><i></i></button>
      </div>

      <div class="card list-card">
        ${row('rates', I.rupee, t('ratesTitle'), `${serviceName('iron')} · ${serviceName('wash')} · ${serviceName('dry')}`)}
      </div>

      <h2 class="section-title">${I.user}${esc(t('dhobis'))}</h2>
      <div class="card list-card">
        ${db.dhobis.map((d) => `<div class="row">
          <span class="row-ic">${I.user}</span><span class="row-txt"><b>${esc(dhobiName(d.id))}</b></span>
          <button class="icon-btn small tap" data-act="rename" data-id="${d.id}" aria-label="${esc(t('rename'))}">${I.edit}</button>
          ${db.dhobis.length > 1 ? `<button class="icon-btn small tap" data-act="del-dhobi" data-id="${d.id}" aria-label="${esc(t('deleteDhobi'))}">${I.trash}</button>` : ''}
        </div>`).join('')}
        <button class="row tap add-row" data-act="add-dhobi"><span class="row-ic">${I.plus}</span><span class="row-txt"><b>${esc(t('addDhobi'))}</b></span></button>
      </div>

      <h2 class="section-title">${I.download}${esc(t('backup'))}</h2>
      <div class="card list-card">
        ${row('csv', I.table, t('exportCsv'))}
        ${row('backup', I.download, t('backupJson'))}
        ${row('restore', I.upload, t('restoreJson'))}
      </div>


      <p class="fine center">🔒 ${esc(t('privacy'))}<br>v1.1.0</p>
    </main>${s.grandma ? '' : tabBar('more')}`;
  },
  actions: {
    ...familyActions,
    lang(el) { applyLang(el.dataset.id); haptic(); refresh(); },
    grandma() {
      const on = !getDB().settings.grandma;
      setSetting('grandma', on);
      applyGrandma(on);
      haptic('medium');
      if (on) go('home', {}, { reset: true }); else refresh();
    },
    rates: () => go('rates', {}),
    rename(el) {
      const d = getDB().dhobis.find((x) => x.id === el.dataset.id);
      promptSheet({ title: t('rename'), placeholder: t('name'), value: d?.name || '', onOk: (v) => { renameDhobi(el.dataset.id, v); refresh(); } });
    },
    'add-dhobi'() { promptSheet({ title: t('addDhobi'), placeholder: t('name'), onOk: (v) => { addDhobi(v); refresh(); } }); },
    'del-dhobi'(el) {
      confirmSheet({
        title: `${t('deleteDhobi')}: ${dhobiName(el.dataset.id)}?`, sub: t('deleteDhobiSub'), yes: t('delete'),
        onYes: () => { deleteDhobi(el.dataset.id); snack(t('deleted'), { canUndo: true }); refresh(); },
      });
    },
    csv: () => exportCSV({ itemName, serviceName, dhobiName, statusName }),
    backup: () => backupJSON(),
    async restore() {
      try {
        const data = await readBackupFile();
        if (!data) return;
        confirmSheet({
          title: t('restoreConfirm'), sub: t('restoreConfirmSub'), yes: t('restore'),
          onYes: () => {
            applyBackup(data);
            const s = getDB().settings;
            setLang(s.lang || getLang());
            applyGrandma(s.grandma);
            snack(t('restored'), { canUndo: true });
            refresh();
          },
        });
      } catch {
        snack(t('badFile'), { tone: 'red' });
      }
    },
  },
});

/* First run: pick a language with three huge buttons. */
screen('welcome', {
  view() {
    return `<main class="screen welcome">
      <div class="welcome-art">${I.bill}</div>
      <h1 class="brand big">Dhobi Diary</h1>
      <p class="welcome-sub">धोबी डायरी · ધોબી ડાયરી</p>
      <div class="stack">${LANGS.map((l) => `<button class="btn btn-outline btn-lang tap" data-act="pick" data-id="${l.id}" lang="${l.id}">${esc(l.label)}</button>`).join('')}</div>
    </main>`;
  },
  actions: { pick: (el) => { applyLang(el.dataset.id); haptic(); go('home', {}, { reset: true }); } },
});
