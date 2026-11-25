// Settings → Family: start a family diary, join with a code, see who is in it.
import { openSheet, closeSheet, refresh } from '../ui/router.js';
import { t } from '../i18n/index.js';
import { I } from '../ui/icons.js';
import { esc, snack, confirmSheet } from '../ui/kit.js';
import { getDB } from '../core/db.js';
import { family } from '../features/sharing/index.js';
import { shareText, hapticSuccess } from '../platform/native.js';

const spaced = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

function busySheet() {
  openSheet(() => `<div class="busy"><span class="spinner" aria-hidden="true"></span><p>${esc(t('connecting'))}</p></div>`);
}

function errorText(e) {
  return String(e?.message).includes('bad-code') ? t('badCode') : t('needInternet');
}

export function familyCard() {
  const s = getDB().settings;
  if (!family.available()) {
    return `<div class="card list-card soon"><div class="row"><span class="row-ic">${I.family}</span><span class="row-txt"><b>${esc(t('family'))}</b><small>${esc(t('familyNotSetUp'))}</small></span></div></div>`;
  }
  if (!s.family) {
    return `<div class="card list-card">
      <button class="row tap" data-act="fam-create"><span class="row-ic">${I.plus}</span><span class="row-txt"><b>${esc(t('createFamily'))}</b><small>${esc(t('createFamilySub'))}</small></span><span class="row-go">${I.next}</span></button>
      <button class="row tap" data-act="fam-join"><span class="row-ic">${I.family}</span><span class="row-txt"><b>${esc(t('joinFamily'))}</b><small>${esc(t('joinFamilySub'))}</small></span><span class="row-go">${I.next}</span></button>
    </div>`;
  }
  const st = family.status;
  const me = st.uid;
  return `<div class="card family-card">
    <span class="label">${esc(t('familyCode'))}</span>
    <div class="code-row"><b class="fam-code">${esc(spaced(s.family.code))}</b>
      <button class="btn btn-outline btn-small tap" data-act="fam-share">${I.share}${esc(t('shareCode'))}</button></div>
    <small class="muted">${esc(t('codeHint'))}</small>
    <span class="label">${esc(t('members'))}</span>
    <div class="people">${(st.members.length ? st.members : [{ uid: me, name: s.userName }]).map((m) => `
      <span class="person ${m.uid === me ? 'me' : ''}"><i>${esc((m.name || '?').slice(0, 1).toUpperCase())}</i>${esc(m.name || '?')}${m.uid === me ? ` <small>(${esc(t('you'))})</small>` : ''}</span>`).join('')}</div>
    <div class="fam-actions">
      <button class="btn btn-ghost tap" data-act="fam-rename">${I.edit}${esc(t('rename'))}</button>
      <button class="btn btn-ghost danger-text tap" data-act="fam-leave">${esc(t('leaveFamily'))}</button>
    </div>
  </div>`;
}

function nameField(value) {
  return `<input class="field" id="fam-name" maxlength="30" placeholder="${esc(t('yourName'))}" value="${esc(value)}" autocomplete="off" autocapitalize="words" enterkeyhint="done">`;
}

export const familyActions = {
  'fam-create'() {
    openSheet(() => `
      <h2 class="sheet-title">${I.family} ${esc(t('createFamily'))}</h2>
      <p class="sheet-sub">${esc(t('createFamilySub'))}</p>
      ${nameField(getDB().settings.userName)}
      <div class="sheet-actions">
        <button class="btn btn-primary tap" data-act="go">${esc(t('next'))}</button>
        <button class="btn btn-ghost tap" data-act="sheet-close">${esc(t('cancel'))}</button>
      </div>`, {
      async go() {
        const name = document.getElementById('fam-name').value.trim();
        if (!name) return document.getElementById('fam-name').focus();
        busySheet();
        try {
          const f = await family.create(name);
          hapticSuccess();
          openSheet(() => `
            <h2 class="sheet-title">${I.check} ${esc(t('created'))}</h2>
            <p class="sheet-sub">${esc(t('codeHint'))}</p>
            <b class="fam-code big">${esc(spaced(f.code))}</b>
            <div class="sheet-actions">
              <button class="btn btn-primary tap" data-act="fam-share">${I.share}${esc(t('shareCode'))}</button>
              <button class="btn btn-ghost tap" data-act="sheet-close">${esc(t('done'))}</button>
            </div>`, { 'fam-share': familyActions['fam-share'] });
          refresh();
        } catch (e) { closeSheet(); snack(errorText(e), { tone: 'red' }); }
      },
    });
  },
  'fam-join'() {
    openSheet(() => `
      <h2 class="sheet-title">${I.family} ${esc(t('joinFamily'))}</h2>
      <input class="field code-field" id="fam-code" maxlength="7" placeholder="${esc(t('enterCode'))}" autocomplete="off" autocapitalize="characters" spellcheck="false">
      ${nameField(getDB().settings.userName)}
      <div class="sheet-actions">
        <button class="btn btn-primary tap" data-act="go">${esc(t('joinFamily'))}</button>
        <button class="btn btn-ghost tap" data-act="sheet-close">${esc(t('cancel'))}</button>
      </div>`, {
      async go() {
        const code = document.getElementById('fam-code').value.replace(/\s/g, '');
        const name = document.getElementById('fam-name').value.trim();
        if (code.length !== 6) return document.getElementById('fam-code').focus();
        if (!name) return document.getElementById('fam-name').focus();
        busySheet();
        try {
          await family.join(code, name);
          closeSheet();
          hapticSuccess();
          snack(t('joined'));
          refresh();
        } catch (e) { closeSheet(); snack(errorText(e), { tone: 'red' }); }
      },
    });
  },
  async 'fam-share'() {
    const code = getDB().settings.family?.code;
    if (!code) return;
    const r = await shareText(t('familyCode'), t('shareCodeText', spaced(code)));
    if (r === 'copied') snack('✓ Copied');
  },
  'fam-rename'() {
    openSheet(() => `
      <h2 class="sheet-title">${esc(t('rename'))}</h2>
      ${nameField(getDB().settings.userName)}
      <div class="sheet-actions">
        <button class="btn btn-primary tap" data-act="go">${esc(t('save'))}</button>
        <button class="btn btn-ghost tap" data-act="sheet-close">${esc(t('cancel'))}</button>
      </div>`, {
      async go() {
        const name = document.getElementById('fam-name').value.trim();
        if (!name) return;
        closeSheet();
        await family.rename(name);
        refresh();
      },
    });
  },
  'fam-leave'() {
    confirmSheet({
      title: t('leaveFamily') + '?', sub: t('leaveFamilySub'), yes: t('leave'),
      onYes: async () => { await family.leave(); refresh(); },
    });
  },
};
