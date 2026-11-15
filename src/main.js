import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import './style.css';

import { getDishes, setDishCount, resetDishes, MIN_COUNT, MAX_COUNT } from './presets.js';
import { load, save, remove } from './store.js';
import { LANGS, VOICE, ordinal } from './i18n.js';
import { unlockAudio, chime, startAlarm, stopAlarm, vibrate, speak, keepAwake, isAwake, hasVoiceFor } from './alerts.js';
import { openMic } from './audio.js';
import { WhistleDetector, buildParams, calibrate } from './detector.js';
import { cookerSVG, puff } from './cooker.js';
import { I } from './icons.js';

/*
  Look: warm storybook (cream, white cards, brown sheet, leaf + turmeric).
  Feel: everyday-app interaction habits, adapted —
   - tabs at the bottom with labels; screens slide in/out so people keep their place
   - every tap presses in + a tiny vibration
   - live status line with animated dots while listening ("someone is typing" feel)
   - a whistle counted automatically shows a snackbar with Undo (fix mistakes in one tap)
   - segmented progress bar with one segment per whistle (chapter marks)
   - confirmations as bottom sheets, never pop-up dialogs
   - History: one tap to "Cook again"
  Accessibility: 18px base text, 56px+ targets, words under every icon, plain language.
*/

/* ------------------------------------------------------------------ state */
const app = document.getElementById('app');
const PREVIEW = import.meta.env.VITE_PREVIEW === '1';

const state = {
  screen: 'home',
  dishes: getDishes(),
  selectedId: load('lastDish', 'dal'),
  settings: { lang: 'hi', releaseOn: true, releaseMin: 10, sens: 'normal', ai: true, ...load('settings', {}) },
  calib: load('calib', null),
  history: load('history', []),
  session: null,
  aiStatus: 'off',
  aiLabel: null,
};

const bind = {};
let mic = null;
let detector = null;
let stopAi = null;
let meterRaf = 0;
let calibRun = null;
let releaseTimer = null;
let hiddenAt = null;
let snackTimer = null;

const $ = (sel, root = app) => root.querySelector(sel);
const $$ = (sel, root = app) => [...root.querySelectorAll(sel)];
const selected = () => state.dishes.find((d) => d.id === state.selectedId) || state.dishes[0];
const saveSettings = () => save('settings', state.settings);
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n) => (n === 1 ? 'whistle' : 'whistles');
const tick = () => vibrate(8); // tiny haptic on taps (Android)
const DISH_BG = { dal: '#FFE08A', rice: '#CFE8F7', rajma: '#F9C4BC', chole: '#FAD3A5', aloo: '#D6EBC0', khichdi: '#E2D6F3', custom: '#F3EDE5' };
const TABS = ['home', 'history', 'settings'];

function go(screen, { back = false } = {}) {
  state.screen = screen;
  state.navBack = back || (TABS.includes(screen) && TABS.indexOf(screen) < TABS.indexOf(state.lastTab ?? 'home'));
  if (TABS.includes(screen)) state.lastTab = screen;
  render();
  window.scrollTo({ top: 0 });
}

function render() {
  cancelAnimationFrame(meterRaf);
  const views = { home, history, settings, permission, listen, done, release, calibrate: calibrateView };
  app.innerHTML = views[state.screen]();
  app.firstElementChild?.classList.add(state.navBack ? 'screen-back' : 'screen-in');
  state.navBack = false;
  bind[state.screen]?.();
}

/* ------------------------------------------------------------- building blocks */
function bottomNav(active) {
  const item = (id, icon, label) => `<button data-tab="${id}" class="tap flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl ${active === id ? 'text-ink' : 'text-muted'}" aria-current="${active === id ? 'page' : 'false'}">
      <span class="flex h-8 w-14 items-center justify-center rounded-full ${active === id ? 'bg-mist' : ''}">${icon}</span>
      <span class="text-[14px] ${active === id ? 'font-bold' : 'font-semibold'}">${label}</span></button>`;
  return `<nav class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper" style="padding-bottom:env(safe-area-inset-bottom)">
    <div class="mx-auto flex max-w-md px-2 py-1">
      ${item('home', I.pot(), 'Cook')}${item('history', I.history(), 'History')}${item('settings', I.gear(), 'Settings')}
    </div></nav>`;
}
const NAV_H = 'calc(72px + env(safe-area-inset-bottom))';

function topBar(title, { back = false, sub = '' } = {}) {
  return `<header class="flex items-center gap-3 px-4 pb-2" style="padding-top:max(1rem,env(safe-area-inset-top))">
    ${back ? `<button data-back class="tap flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-paper shadow-sm" aria-label="Back">${I.back('h-6 w-6')}</button>` : ''}
    <div class="min-w-0"><h1 class="text-[26px] font-extrabold leading-tight">${title}</h1>${sub ? `<p class="text-[16px] text-muted">${sub}</p>` : ''}</div>
  </header>`;
}

function toggle(name, on, label) {
  return `<button data-toggle="${name}" role="switch" aria-checked="${on}" aria-label="${label}"
    class="tap relative h-9 w-16 shrink-0 rounded-full transition-colors ${on ? 'bg-leaf' : 'bg-sand'}">
    <span class="absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${on ? 'left-8' : 'left-1'}"></span>
  </button>`;
}

// Grey square − / value / + (reader-panel style).
function stepper(attr, value, unit, less, more) {
  return `<div class="flex items-center gap-3">
    <button ${attr}="-1" class="tap btn-soft flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-bold" aria-label="${less}">−</button>
    <div class="flex h-16 flex-1 items-center justify-center rounded-2xl bg-mist"><span class="text-[34px] font-extrabold">${value}</span><span class="ml-1.5 text-[17px] font-semibold text-muted">${unit}</span></div>
    <button ${attr}="1" class="tap btn-soft flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-bold" aria-label="${more}">+</button>
  </div>`;
}

// Pill switch (like an "Audio | Text" toggle), wraps on narrow screens.
function segmented(name, value, options, label) {
  return `<div class="flex flex-wrap gap-1 rounded-[22px] bg-mist p-1" role="radiogroup" aria-label="${label}">
    ${options.map(([v, l]) => `<button data-seg="${name}" data-val="${v}" role="radio" aria-checked="${value === v}"
      class="tap min-h-12 flex-1 whitespace-nowrap rounded-full px-3 text-[16px] font-bold transition-colors ${value === v ? 'bg-brown text-cream shadow-sm' : 'text-muted'}">${l}</button>`).join('')}
  </div>`;
}

function segProgress(count, target, animateLast = false) {
  return `<div class="flex gap-1.5" aria-hidden="true">
    ${Array.from({ length: target }, (_, i) => `<div class="seg flex-1 ${animateLast && i === count - 1 ? 'fill' : ''}">${i < count ? '<i></i>' : ''}</div>`).join('')}
  </div>`;
}

// Bottom sheet confirmation (no pop-up dialogs).
function confirmSheet({ title, text, yes, no = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'sheet-bg fixed inset-0 z-40 flex items-end justify-center bg-ink/40';
    el.innerHTML = `<div class="sheet w-full max-w-md rounded-t-[32px] bg-paper px-6 pt-3" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="padding-bottom:max(1.5rem,env(safe-area-inset-bottom))">
      <div class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-sand"></div>
      <h2 class="text-[22px] font-extrabold">${esc(title)}</h2>
      <p class="mt-1 text-[17px] text-muted">${esc(text)}</p>
      <div class="mt-5 grid gap-2">
        <button data-yes class="tap min-h-14 rounded-full text-[18px] font-bold ${danger ? 'bg-mirch text-white' : 'btn-primary'}">${esc(yes)}</button>
        <button data-no class="tap btn-soft min-h-14 rounded-full text-[18px] font-bold">${esc(no)}</button>
      </div></div>`;
    document.body.appendChild(el);
    const close = (v) => { el.remove(); resolve(v); };
    el.querySelector('[data-yes]').addEventListener('click', () => { tick(); close(true); });
    el.querySelector('[data-no]').addEventListener('click', () => close(false));
    el.addEventListener('click', (e) => { if (e.target === el) close(false); });
    el.querySelector('[data-no]').focus();
  });
}

// Snackbar with an optional action (e.g. Undo), auto-hides.
function snackbar(text, action, onAction, ms = 6000) {
  document.querySelector('.snack')?.remove();
  clearTimeout(snackTimer);
  const el = document.createElement('div');
  el.className = 'snack fixed inset-x-3 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-cream shadow-xl';
  el.style.bottom = 'calc(96px + env(safe-area-inset-bottom))';
  el.setAttribute('role', 'status');
  el.innerHTML = `<p class="flex-1 text-[17px] font-semibold">${esc(text)}</p>${action ? `<button class="tap flex min-h-12 items-center gap-1.5 rounded-full px-3 text-[17px] font-extrabold text-haldi">${I.undo('h-5 w-5')}${esc(action)}</button>` : ''}`;
  document.body.appendChild(el);
  el.querySelector('button')?.addEventListener('click', () => { tick(); el.remove(); onAction?.(); });
  snackTimer = setTimeout(() => el.remove(), ms);
}

/* ------------------------------------------------------------------- HOME */
function home() {
  const d = selected();
  return `
  <main class="relative overflow-hidden" style="padding-bottom:calc(170px + env(safe-area-inset-bottom))">
    <div class="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-leaf" aria-hidden="true"></div>
    <header class="relative px-5" style="padding-top:max(1.5rem,env(safe-area-inset-top))">
      <h1 class="text-[44px] font-extrabold leading-none tracking-tight">Seeti</h1>
      <p class="mt-2 max-w-[14rem] text-[17px] font-semibold text-muted">Cooker ki seeti, hum ginenge.</p>
    </header>

    <section class="mt-7 px-5">
      <h2 class="text-[21px] font-extrabold">What are you cooking?</h2>
      <div class="mt-3 grid grid-cols-3 gap-x-3 gap-y-4" role="radiogroup" aria-label="Dish">
        ${state.dishes.map((x) => `
          <button class="dish tap text-left ${x.id === 'custom' ? 'col-span-3 flex items-center gap-4' : ''}" data-dish="${x.id}" role="radio" aria-checked="${x.id === d.id}">
            <span class="dish-art relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl ${x.id === 'custom' ? 'w-20 shrink-0' : ''}" style="background:${DISH_BG[x.id]}">
              <span class="absolute -bottom-5 -right-5 h-16 w-16 rounded-full bg-white/35"></span>
              <span class="relative text-[44px] leading-none">${x.emoji}</span>
              ${x.id === d.id ? `<span class="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-cream">${I.check('h-4 w-4')}</span>` : ''}
            </span>
            <span class="${x.id === 'custom' ? '' : 'mt-1.5 block'}"><span class="block text-[17px] font-bold leading-tight">${x.id === 'custom' ? 'Something else' : x.name}</span>
            <span class="block text-[15px] font-semibold text-muted">${x.count} ${plural(x.count)}${x.id === 'custom' ? ' · set below' : ''}</span></span>
          </button>`).join('')}
      </div>
    </section>

    <section class="mx-5 mt-6 rounded-3xl bg-paper p-5 shadow-sm">
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="text-[21px] font-extrabold">How many whistles?</h2>
        <span class="text-[15px] font-semibold text-muted">for ${esc(d.name)}</span>
      </div>
      <div class="mt-4">${stepper('data-step', d.count, '', 'One less whistle', 'One more whistle')}</div>
      <p class="mt-3 text-[15px] text-muted">Seeti remembers this for next time.</p>
    </section>

    <div class="fixed inset-x-0 z-20 px-5" style="bottom:calc(80px + env(safe-area-inset-bottom))">
      <div class="mx-auto max-w-md">
        <button data-start class="tap btn-primary flex w-full items-center gap-4 rounded-full p-2 pr-6 shadow-lg">
          <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-cream text-brown">${I.ear('h-7 w-7')}</span>
          <span class="flex-1 text-left"><span class="block text-[20px] font-extrabold leading-tight">Start listening</span>
          <span class="block text-[15px] font-semibold text-sand">${esc(d.name)} · ${d.count} ${plural(d.count)}</span></span>
          <span class="text-2xl" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
    ${bottomNav('home')}
  </main>`;
}

function bindTabs() {
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => { tick(); if (state.screen !== b.dataset.tab) go(b.dataset.tab); }));
}

bind.home = () => {
  bindTabs();
  $$('[data-dish]').forEach((b) => b.addEventListener('click', () => {
    tick();
    state.selectedId = b.dataset.dish;
    save('lastDish', state.selectedId);
    const y = window.scrollY;
    state.navBack = null;
    app.innerHTML = home();
    bind.home();
    window.scrollTo({ top: y });
  }));
  $$('[data-step]').forEach((b) => b.addEventListener('click', () => {
    tick();
    const d = selected();
    setDishCount(d.id, Math.max(MIN_COUNT, Math.min(MAX_COUNT, d.count + Number(b.dataset.step))));
    state.dishes = getDishes();
    const y = window.scrollY;
    app.innerHTML = home();
    bind.home();
    window.scrollTo({ top: y });
  }));
  $('[data-start]').addEventListener('click', () => { tick(); unlockAudio(); needMic(() => startSession()); });
};

/* ---------------------------------------------------------------- HISTORY */
function relDay(t) {
  const d = new Date(t);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  return same(d, today) ? 'Today' : same(d, y) ? 'Yesterday' : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function history() {
  const h = state.history;
  return `
  <main style="padding-bottom:calc(96px + env(safe-area-inset-bottom))">
    ${topBar('History', { sub: 'Your recent cooking' })}
    ${h.length ? `<section class="mx-4 mt-2 overflow-hidden rounded-3xl bg-paper shadow-sm">
      ${h.map((e, i) => {
        const dish = state.dishes.find((x) => x.id === e.dishId) || { emoji: '🍲', name: e.name, id: 'custom' };
        return `<div class="flex items-center gap-3 px-4 py-3 ${i ? 'border-t border-line' : ''}">
          <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl" style="background:${DISH_BG[dish.id] || DISH_BG.custom}">${dish.emoji}</span>
          <div class="min-w-0 flex-1">
            <p class="text-[19px] font-bold leading-tight">${esc(e.name)}</p>
            <p class="text-[15px] text-muted">${e.count} ${plural(e.count)} · ${relDay(e.at)} ${fmtTime(e.at)}</p>
          </div>
          <button data-again="${i}" class="tap btn-soft min-h-12 shrink-0 rounded-full px-4 text-[16px] font-bold" aria-label="Cook ${esc(e.name)} again">Again</button>
        </div>`;
      }).join('')}
    </section>` : `
    <section class="mx-4 mt-6 rounded-3xl bg-paper p-6 text-center shadow-sm">
      <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-mist text-muted">${I.history('h-8 w-8')}</span>
      <h2 class="mt-3 text-[21px] font-extrabold">Nothing here yet</h2>
      <p class="mt-1 text-[17px] text-muted">When you finish cooking, it shows up here. Next time, tap <b>Cook again</b> to start in one tap.</p>
      <button data-tab-go="home" class="tap btn-primary mt-5 min-h-14 rounded-full px-6 text-[18px] font-bold">Start cooking</button>
    </section>`}
    ${bottomNav('history')}
  </main>`;
}

bind.history = () => {
  bindTabs();
  $('[data-tab-go]')?.addEventListener('click', () => go('home'));
  $$('[data-again]').forEach((b) => b.addEventListener('click', () => {
    tick();
    const e = state.history[Number(b.dataset.again)];
    if (state.dishes.some((x) => x.id === e.dishId)) { state.selectedId = e.dishId; save('lastDish', e.dishId); }
    unlockAudio();
    needMic(() => startSession(e.count));
  }));
};

function addHistory(s) {
  state.history = [{ dishId: s.dish.id, name: s.dish.name, count: s.count, at: Date.now(),
    mins: s.endedAt ? Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000)) : null }, ...state.history].slice(0, 20);
  save('history', state.history);
}

/* --------------------------------------------------------------- SETTINGS */
function settingCard(title, sub, control = '', below = '') {
  return `<section class="rounded-3xl bg-paper p-5 shadow-sm">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0"><h2 class="text-[19px] font-extrabold leading-tight">${title}</h2><p class="mt-1 text-[16px] leading-snug text-muted">${sub}</p></div>
      ${control}
    </div>${below ? `<div class="mt-4">${below}</div>` : ''}
  </section>`;
}

function settings() {
  const st = state.settings;
  return `
  <main style="padding-bottom:calc(96px + env(safe-area-inset-bottom))">
    ${topBar('Settings')}
    <div class="mt-2 space-y-3 px-4">
      ${settingCard('Voice language', 'Seeti says the count out loud.', '',
        segmented('lang', st.lang, LANGS.map((l) => [l.id, l.label]), 'Voice language'))}
      ${settingCard("Learn my cooker's whistle",
        state.calib ? '<span class="font-bold text-leaf">✓ Done.</span> Seeti knows your cooker.' : 'Optional, 1 minute. Seeti listens to one whistle and counts better after that.',
        '', `<button data-go="calibrate" class="tap btn-primary min-h-12 rounded-full px-6 text-[17px] font-bold">${state.calib ? 'Do it again' : 'Start'}</button>`)}
      ${settingCard('Safe-to-open timer', "After the gas is off, steam is still inside. Seeti waits, then tells you when it's safe to open the lid.",
        toggle('releaseOn', st.releaseOn, 'Safe-to-open timer'),
        st.releaseOn ? stepper('data-rel', st.releaseMin, 'min', 'Less time', 'More time') : '')}
      ${settingCard('Where is your phone?', 'Helps Seeti hear the right sounds.', '',
        segmented('sens', st.sens, [['low', 'Noisy kitchen'], ['normal', 'Near cooker'], ['high', 'Far away']], 'Phone position'))}
      ${settingCard('Smart listening', 'A free AI helper double-checks each whistle. Needs about 15 MB of internet once.',
        toggle('ai', st.ai, 'Smart listening'))}
      ${settingCard('Reset dish whistles', 'Go back to the usual numbers (Dal 3, Rice 2…).', '',
        '<button data-reset class="tap btn-soft min-h-12 rounded-full px-6 text-[17px] font-bold">Reset</button>')}
      <p class="flex items-center gap-2 px-1 pb-2 text-[15px] text-muted">${I.lock('h-5 w-5 shrink-0')} Nothing is recorded or uploaded. Sound is checked on your phone only.</p>
    </div>
    ${bottomNav('settings')}
  </main>`;
}

bind.settings = () => {
  bindTabs();
  const rerender = () => { const y = window.scrollY; state.navBack = null; app.innerHTML = settings(); bind.settings(); window.scrollTo({ top: y }); };
  $$('[data-seg]').forEach((b) => b.addEventListener('click', () => {
    tick();
    state.settings[b.dataset.seg] = b.dataset.val;
    saveSettings();
    rerender();
    if (b.dataset.seg === 'lang') { unlockAudio(); speak(VOICE[state.settings.lang].count(1), state.settings.lang); }
  }));
  $$('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
    tick();
    state.settings[b.dataset.toggle] = !state.settings[b.dataset.toggle];
    saveSettings();
    rerender();
  }));
  $$('[data-rel]').forEach((b) => b.addEventListener('click', () => {
    tick();
    state.settings.releaseMin = Math.max(1, Math.min(30, state.settings.releaseMin + Number(b.dataset.rel)));
    saveSettings();
    rerender();
  }));
  $('[data-reset]').addEventListener('click', async () => {
    if (!(await confirmSheet({ title: 'Reset all dishes?', text: 'Whistle numbers go back to the usual ones.', yes: 'Yes, reset' }))) return;
    resetDishes();
    state.dishes = getDishes();
    rerender();
    snackbar('Dish whistles reset');
  });
  $('[data-go="calibrate"]').addEventListener('click', () => { tick(); needMic(() => go('calibrate')); });
};

/* ------------------------------------------------------------- PERMISSION */
let afterPermission = null;

async function needMic(next) {
  if (PREVIEW) return next();
  let granted = load('micOk', false);
  try {
    const p = await navigator.permissions?.query({ name: 'microphone' });
    if (p) granted = p.state === 'granted';
  } catch { /* not supported everywhere */ }
  if (granted) return next();
  afterPermission = next;
  go('permission');
}

function permission() {
  const row = (icon, title, text) => `<li class="flex gap-4"><span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-mist">${icon}</span>
    <div><p class="text-[19px] font-extrabold">${title}</p><p class="text-[17px] text-muted">${text}</p></div></li>`;
  return `
  <main class="flex min-h-dvh flex-col">
    ${topBar('Allow microphone', { back: true })}
    <div class="flex flex-1 flex-col px-5">
      <div class="mx-auto mt-2 w-48 overflow-hidden rounded-3xl bg-[#FFD98E]">${cookerSVG({ flame: false })}</div>
      <h2 class="mt-5 text-center text-[26px] font-extrabold leading-tight">Seeti needs to hear your cooker</h2>
      <ul class="mt-6 space-y-5">
        ${row(I.bell(), 'Why?', 'To hear each whistle and count it for you.')}
        ${row(I.lock(), 'Private', 'Nothing is recorded, saved or sent anywhere.')}
        ${row(I.phone(), 'Keep Seeti open', 'Leave the app on the screen while cooking.')}
      </ul>
      <p id="permErr" class="mt-5 hidden rounded-2xl bg-[#FDECEA] p-4 text-[17px] text-[#B3121C]"></p>
      <div class="mt-auto py-5" style="padding-bottom:max(1.25rem,env(safe-area-inset-bottom))">
        <button data-allow class="tap btn-primary min-h-14 w-full rounded-full text-[20px] font-extrabold">Allow microphone</button>
        <p class="mt-3 text-center text-[15px] text-muted">Your phone will ask. Tap <b>Allow</b>.</p>
      </div>
    </div>
  </main>`;
}

bind.permission = () => {
  $('[data-back]').addEventListener('click', () => go('home', { back: true }));
  $('[data-allow]').addEventListener('click', async () => {
    tick();
    unlockAudio();
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      save('micOk', true);
      const next = afterPermission;
      afterPermission = null;
      next ? next() : go('home');
    } catch (e) {
      const el = $('#permErr');
      el.classList.remove('hidden');
      el.textContent = micErrorText(e);
    }
  });
};

function micErrorText(e) {
  if (PREVIEW) return 'This is a design preview, so the mic is off here. Tap "Count by hand" to try the app.';
  if (!window.isSecureContext) return 'The mic only works on a secure link (starting with https://).';
  if (e?.name === 'NotAllowedError') return 'The mic is blocked. Open phone Settings → your browser → Microphone → Allow. Then try again.';
  if (e?.name === 'NotFoundError') return 'No microphone was found on this phone.';
  if (e?.name === 'NotReadableError') return 'Another app is using the mic (a call or voice note). Close it and try again.';
  return 'Could not start the mic. Please try again.';
}

/* --------------------------------------------------------------- SESSION */
async function startSession(targetOverride) {
  const d = selected();
  const target = targetOverride ?? d.count;
  state.session = { dish: d, target, count: 0, log: [], startedAt: new Date(), phase: 'learning', error: null };
  state.aiStatus = 'off';
  go('listen');
  try {
    mic = await openMic();
    save('micOk', true);
  } catch (e) {
    state.session.error = micErrorText(e);
    render();
    return;
  }
  mic.stream.getAudioTracks()[0]?.addEventListener('ended', () => {
    if (state.screen === 'listen') addNote('The phone stopped the mic. Tap Stop and start again.');
  });
  detector = new WhistleDetector(mic, buildParams(state.calib, state.settings.sens), {
    onWhistle: ({ source, at }) => countWhistle(source, at),
    onPhase: (p) => { state.session.phase = p; updateStatus(); },
  });
  detector.start();
  keepAwake(true).then(updateWakeNote);
  speak(VOICE[state.settings.lang].hello, state.settings.lang);
  if (state.settings.ai) startAiLayer();
}

async function startAiLayer() {
  state.aiStatus = 'loading';
  try {
    const { startYamnet } = await import('./yamnet.js');
    if (!mic || state.screen !== 'listen') return;
    stopAi = await startYamnet(mic, (score, label) => {
      detector?.setAiScore(score);
      state.aiLabel = score > 0.15 ? label : null;
    });
    state.aiStatus = 'on';
  } catch (e) {
    console.warn('AI layer unavailable', e);
    state.aiStatus = 'error';
    if (!PREVIEW) addNote(navigator.onLine
      ? 'Smart listening could not start on this phone. Normal listening still works.'
      : 'Smart listening needs internet once. Normal listening still works.');
  }
  updateStatus();
}

function stopListening() {
  detector?.stop();
  detector = null;
  stopAi?.();
  stopAi = null;
  mic?.close();
  mic = null;
  cancelAnimationFrame(meterRaf);
  document.querySelector('.snack')?.remove();
}

function countWhistle(source = 'sound', at = new Date()) {
  const s = state.session;
  if (!s || s.count >= s.target) return;
  s.count += 1;
  s.log.push({ n: s.count, time: at, source });
  vibrate(source === 'manual' ? 30 : [180, 80, 180]);
  puff($('#liveCooker'));
  updateCount(true);
  renderLog();
  const lang = state.settings.lang;
  if (s.count >= s.target) { reachTarget(); return; }
  chime();
  const left = s.target - s.count;
  setTimeout(() => speak(VOICE[lang].count(s.count) + (left === 1 ? '. ' + VOICE[lang].oneLeft : ''), lang), 350);
  // Heard automatically? Offer a one-tap fix in case it wasn't a whistle.
  if (source !== 'manual') snackbar(`${ordinal(s.count)} whistle counted`, 'Undo', undoWhistle);
}

function undoWhistle() {
  const s = state.session;
  if (!s || s.count === 0) return;
  for (let i = s.log.length - 1; i >= 0; i--) {
    if (s.log[i].n === s.count) { s.log.splice(i, 1); break; }
  }
  s.count -= 1;
  vibrate(30);
  updateCount();
  renderLog();
}

function addNote(text) {
  state.session?.log.push({ type: 'note', text, time: new Date() });
  renderLog();
}

function reachTarget() {
  stopListening();
  state.session.endedAt = new Date();
  addHistory(state.session);
  showAlarm({
    title: { hi: 'Gas band karo!', en: 'Turn off the gas!', gu: 'ગેસ બંધ કરો!' },
    sub: 'Turn off the gas!',
    kind: 'gasOff',
    onStop: () => {
      if (state.settings.releaseOn) startRelease();
      else { keepAwake(false); go('done'); }
    },
  });
}

/* ---------------------------------------------------------------- LISTEN */
function logList(log) {
  if (!log.length) return `<p class="py-2 text-[16px] text-sand">Each whistle shows up here with its time.</p>`;
  return `<ol class="space-y-2">${log.map((e, i) => {
    const fresh = i === log.length - 1 ? 'arrive' : '';
    return e.type === 'note'
      ? `<li class="${fresh} rounded-2xl bg-brown-2 px-4 py-2.5 text-[16px] text-cream">${esc(e.text)}</li>`
      : `<li class="${fresh} flex items-center gap-3 rounded-2xl bg-brown-2 px-4 py-2.5">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-haldi text-ink">${I.check('h-5 w-5')}</span>
          <span class="flex-1 text-[18px] font-bold">${ordinal(e.n)} whistle${e.source === 'manual' ? ' <span class="text-[15px] font-semibold text-sand">· added by you</span>' : ''}</span>
          <span class="text-[15px] text-sand">${fmtTime(e.time)}</span>
        </li>`;
  }).join('')}</ol>`;
}

function listen() {
  const s = state.session;
  if (s.error) {
    return `
    <main class="flex min-h-dvh flex-col">
      ${topBar(esc(s.dish.name), { back: true })}
      <div class="flex flex-1 flex-col px-5">
        <span class="mx-auto mt-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#FDECEA] text-[#B3121C]">${I.mic('h-10 w-10')}</span>
        <h2 class="mt-4 text-center text-[24px] font-extrabold">The mic did not start</h2>
        <p class="mt-2 text-center text-[18px] text-ink-2">${esc(s.error)}</p>
        <div class="mt-auto grid gap-3 py-5" style="padding-bottom:max(1.25rem,env(safe-area-inset-bottom))">
          <button data-manual class="tap btn-primary min-h-14 rounded-full text-[19px] font-extrabold">Count by hand</button>
          <button data-retry class="tap btn-soft min-h-14 rounded-full text-[18px] font-bold">Try the mic again</button>
        </div>
      </div>
    </main>`;
  }
  return `
  <main class="flex min-h-dvh flex-col bg-brown text-cream">
    <div class="relative overflow-hidden bg-[#FFD98E]">
      <div class="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4" style="padding-top:max(.75rem,env(safe-area-inset-top))">
        <button data-stop class="tap flex min-h-12 items-center gap-2 rounded-full bg-white/90 px-4 text-[17px] font-bold text-ink shadow-sm">${I.stop('h-4 w-4')} Stop</button>
        <span id="aiBadge" class="hidden rounded-full bg-leaf px-3 py-1.5 text-[14px] font-bold text-white shadow-sm">Smart listening</span>
      </div>
      <div id="cookerWrap" class="mx-auto max-w-md pt-12">${cookerSVG({ count: s.count, target: s.target, scene: true, id: 'liveCooker' })}</div>
    </div>

    <section class="relative -mt-8 flex-1 rounded-t-[32px] bg-brown px-5 pt-6" style="padding-bottom:calc(110px + env(safe-area-inset-bottom))">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-[30px] font-extrabold leading-tight">${esc(s.dish.name)}</h1>
          <p class="mt-0.5 flex items-center gap-2 text-[17px] font-semibold text-sand" aria-live="polite"><span id="status"></span><span id="dots" class="dots"><span></span><span></span><span></span></span></p>
        </div>
        <div class="relative h-16 w-16 shrink-0" aria-hidden="true">
          <svg viewBox="0 0 64 64" class="absolute inset-0 -rotate-90">
            <circle cx="32" cy="32" r="29" fill="none" stroke="var(--brown-2)" stroke-width="5"/>
            <circle id="earRing" class="ear-ring" cx="32" cy="32" r="29" fill="none" stroke="var(--haldi)" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>
          </svg>
          <span id="earDot" class="absolute inset-2 rounded-full bg-cream/15 transition-transform duration-100"></span>
          <span class="absolute inset-0 flex items-center justify-center">${I.ear('h-7 w-7')}</span>
        </div>
      </div>

      <div class="mt-4" id="progress">${segProgress(s.count, s.target)}</div>
      <p id="countText" class="mt-2 text-[17px] text-sand"><b class="text-cream">${s.count} of ${s.target}</b> whistles</p>

      <div class="mt-4 rounded-2xl bg-brown-2/60 px-4 py-3">
        <div class="relative h-3 overflow-hidden rounded-full bg-brown" aria-hidden="true">
          <div id="meterLevel" class="h-full w-0 rounded-full bg-sand transition-[width] duration-75"></div>
          <div id="meterThr" class="absolute top-0 h-full w-1 rounded bg-haldi" style="left:0"></div>
        </div>
        <p id="meterNote" class="mt-2 text-[16px] text-sand">Getting ready…</p>
      </div>

      <h2 class="mt-6 text-[19px] font-extrabold">Whistles</h2>
      <div id="log" class="mt-2">${logList(s.log)}</div>
    </section>

    <div class="fixed inset-x-0 bottom-0 z-20 bg-brown/95 px-4 pt-3 backdrop-blur" style="padding-bottom:max(.75rem,env(safe-area-inset-bottom))">
      <div class="mx-auto flex max-w-md gap-3">
        <button data-minus class="tap flex min-h-16 flex-col items-center justify-center rounded-full bg-brown-2 px-6" aria-label="Remove one whistle">
          <span class="text-[22px] font-extrabold leading-none">−1</span><span class="text-[13px] font-semibold text-sand">mistake</span>
        </button>
        <button data-plus class="tap flex min-h-16 flex-1 items-center justify-center rounded-full bg-cream text-[22px] font-extrabold text-brown shadow-md" aria-label="Add one whistle">+1 whistle</button>
      </div>
    </div>
  </main>`;
}

bind.listen = () => {
  const s = state.session;
  if (s.error) {
    $('[data-back]').addEventListener('click', () => { stopListening(); go('home', { back: true }); });
    $('[data-retry]').addEventListener('click', () => startSession(s.target));
    $('[data-manual]').addEventListener('click', () => { s.error = null; s.phase = 'manual'; render(); keepAwake(true); });
    return;
  }
  $('[data-stop]').addEventListener('click', async () => {
    tick();
    if (s.count > 0 && !(await confirmSheet({ title: 'Stop counting?', text: `${s.count} of ${s.target} whistles counted. The count will be lost.`, yes: 'Yes, stop', no: 'Keep counting', danger: true }))) return;
    stopListening();
    keepAwake(false);
    go('home', { back: true });
  });
  $('[data-plus]').addEventListener('click', () => { detector?.pauseFor(6); countWhistle('manual'); });
  $('[data-minus]').addEventListener('click', () => {
    if (!s.count) return snackbar('Nothing to remove yet');
    undoWhistle();
    snackbar(`Removed. Now ${s.count} of ${s.target}`);
  });
  updateStatus();
  updateWakeNote();
  meterLoop();
};

const STATUS = {
  learning: 'Getting ready',
  listening: 'Listening',
  hearing: 'Hearing something',
  cooldown: 'Whistle counted ✓',
  manual: 'Tap +1 for each whistle',
};

function updateStatus() {
  const s = state.session;
  const el = $('#status');
  if (!el || !s) return;
  let text = STATUS[s.phase] || STATUS.listening;
  if (s.phase === 'listening' && s.target - s.count === 1) text = 'Bas ek aur · one more';
  el.textContent = text;
  $('#dots')?.classList.toggle('hidden', ['cooldown', 'manual'].includes(s.phase));
  $('#aiBadge')?.classList.toggle('hidden', state.aiStatus !== 'on');
  $('#liveCooker')?.classList.toggle('hearing', s.phase === 'hearing');
}

function updateCount(added = false) {
  const s = state.session;
  const svgText = $('#liveCooker .cooker-count');
  if (svgText) {
    svgText.textContent = s.count;
    const wrap = $('#cookerWrap');
    wrap?.classList.remove('pop');
    void wrap?.offsetWidth;
    wrap?.classList.add('pop');
  }
  const ct = $('#countText');
  if (ct) ct.innerHTML = `<b class="text-cream">${s.count} of ${s.target}</b> whistles`;
  const pg = $('#progress');
  if (pg) pg.innerHTML = segProgress(s.count, s.target, added);
  updateStatus();
}

function renderLog() {
  const el = $('#log');
  if (el && state.session) el.innerHTML = logList(state.session.log);
}

function updateWakeNote() {
  const s = state.session;
  if (state.screen !== 'listen' || !s || isAwake() || s.wakeNoted) return;
  s.wakeNoted = true;
  addNote('Tip: this phone may lock the screen. Keep Seeti open and turn off auto-lock while cooking.');
}

const dbToPct = (db) => Math.max(0, Math.min(100, ((db + 90) / 80) * 100));

function meterLoop() {
  const level = $('#meterLevel');
  if (!level) return;
  const L = detector?.live;
  if (L) {
    level.style.width = dbToPct(L.levelDb) + '%';
    level.style.background = L.hot ? 'var(--haldi)' : '';
    $('#meterThr').style.left = dbToPct(L.threshold) + '%';
    $('#earRing').setAttribute('stroke-dashoffset', String(100 - L.progress * 100));
    const loud = Math.max(0, Math.min(1, (L.levelDb - L.baseline) / 25));
    $('#earDot').style.transform = `scale(${0.6 + loud * 0.5})`;
    const note = $('#meterNote');
    if (note) {
      note.textContent = L.phase === 'learning' ? `Getting to know your kitchen… ${Math.round(L.learnProgress * 100)}%`
        : L.phase === 'cooldown' ? `Listening again in ${Math.ceil(L.cooldownLeft)} sec`
        : L.hot ? 'Sounds like a whistle. Keep going…'
        : L.levelDb > L.baseline + 4 ? 'Some sound, not a whistle'
        : 'Quiet kitchen';
    }
  } else if (state.session?.phase === 'manual') {
    const note = $('#meterNote');
    if (note) note.textContent = 'Mic is off. Counting by hand.';
  }
  meterRaf = requestAnimationFrame(meterLoop);
}

/* ----------------------------------------------------------------- ALARM */
function showAlarm({ title, sub, kind, onStop }) {
  const lang = state.settings.lang;
  const overlay = document.createElement('div');
  overlay.className = 'alarm fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center text-white';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-label', title.en);
  overlay.tabIndex = 0;
  overlay.innerHTML = `
    <span class="shake flex h-28 w-28 items-center justify-center rounded-full bg-white/20">${kind === 'gasOff' ? I.fire('h-16 w-16') : I.bell('h-16 w-16')}</span>
    <h1 class="mt-6 text-[46px] font-extrabold leading-tight">${esc(title[lang] || title.en)}</h1>
    ${lang !== 'en' ? `<p class="mt-2 text-[24px] font-bold">${esc(sub)}</p>` : ''}
    <p class="mt-4 text-[19px] font-semibold">${esc(state.session?.dish.name || '')} · ${state.session?.count ?? ''} ${plural(state.session?.count ?? 0)}</p>
    <button class="tap mt-10 min-h-16 rounded-full bg-white px-10 text-[22px] font-extrabold text-[#B3121C]">OK, done ✓</button>
    <p class="mt-3 text-[16px] font-semibold text-white/90">Tap anywhere to stop the sound</p>`;
  document.body.appendChild(overlay);
  overlay.focus();
  startAlarm(lang, kind);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    stopAlarm();
    overlay.remove();
    onStop?.();
  };
  overlay.addEventListener('click', stop, { once: true });
  overlay.addEventListener('keydown', (e) => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); stop(); } });
}

/* --------------------------------------------------------------- RELEASE */
function startRelease() {
  state.session.releaseEnd = Date.now() + state.settings.releaseMin * 60_000;
  keepAwake(true);
  go('release');
}

function release() {
  return `
  <main class="flex min-h-dvh flex-col">
    ${topBar('Safe-to-open timer', { sub: 'Steam is still inside' })}
    <div class="flex flex-1 flex-col items-center px-5 text-center">
      <h2 class="mt-2 text-[24px] font-extrabold">Don't open the cooker yet</h2>
      <p class="mt-1 text-[18px] text-muted">Seeti will tell you when it's safe.</p>
      <div class="relative mt-6 aspect-square w-64 max-w-full">
        <svg viewBox="0 0 100 100" class="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--mist)" stroke-width="7"/>
          <circle id="ring" cx="50" cy="50" r="44" fill="none" stroke="var(--brown)" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/>
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span id="clock" class="text-[56px] font-extrabold tabular-nums">--:--</span>
          <span class="text-[17px] font-semibold text-muted">minutes left</span>
        </div>
      </div>
      <div class="mt-6 grid w-full grid-cols-2 gap-3">
        <button data-addmin class="tap btn-soft min-h-14 rounded-2xl text-[19px] font-bold">+1 minute</button>
        <button data-skip class="tap btn-soft min-h-14 rounded-2xl text-[19px] font-bold">Skip</button>
      </div>
      <p class="mt-6 rounded-2xl bg-mist p-4 text-[16px] text-ink-2">Keep Seeti open so the timer can ring. Always check the cooker yourself before opening.</p>
    </div>
  </main>`;
}

bind.release = () => {
  const s = state.session;
  const total = () => state.settings.releaseMin * 60_000 + (s.extraMs || 0);
  const tickClock = () => {
    const left = Math.max(0, s.releaseEnd - Date.now());
    const clock = $('#clock');
    if (!clock) return;
    clock.textContent = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
    $('#ring').setAttribute('stroke-dashoffset', String(100 - (left / total()) * 100));
    if (left <= 0) {
      clearInterval(releaseTimer);
      document.removeEventListener('visibilitychange', tickClock);
      if (document.querySelector('.alarm')) return;
      showAlarm({
        title: { hi: 'Cooker khol sakte ho!', en: 'Safe to open now!', gu: 'કૂકર ખોલી શકો!' },
        sub: 'Safe to open now!',
        kind: 'released',
        onStop: () => { keepAwake(false); go('done'); },
      });
    }
  };
  clearInterval(releaseTimer);
  releaseTimer = setInterval(tickClock, 250);
  document.addEventListener('visibilitychange', tickClock);
  tickClock();
  $('[data-addmin]').addEventListener('click', () => { tick(); s.releaseEnd += 60_000; s.extraMs = (s.extraMs || 0) + 60_000; tickClock(); snackbar('Added 1 minute'); });
  $('[data-skip]').addEventListener('click', () => { tick(); clearInterval(releaseTimer); document.removeEventListener('visibilitychange', tickClock); keepAwake(false); go('done'); });
};

/* ------------------------------------------------------------------ DONE */
function done() {
  const s = state.session;
  const mins = s.endedAt ? Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000)) : null;
  return `
  <main class="flex min-h-dvh flex-col bg-brown text-cream">
    <div class="overflow-hidden bg-[#FFD98E] pt-6">${cookerSVG({ count: s.count, scene: true, flame: false })}</div>
    <section class="relative -mt-8 flex flex-1 flex-col rounded-t-[32px] bg-brown px-5 pt-6" style="padding-bottom:max(1.25rem,env(safe-area-inset-bottom))">
      <h1 class="text-[32px] font-extrabold">Ho gaya! Khana tayyar.</h1>
      <p class="mt-1 text-[18px] text-sand">${esc(s.dish.name)} · ${s.count} ${plural(s.count)}${mins ? ` · ${mins} min` : ''}</p>
      <div class="mt-5">${logList(s.log)}</div>
      <div class="mt-auto grid gap-3 pt-6">
        <button data-home class="tap min-h-14 rounded-full bg-cream text-[19px] font-extrabold text-brown">Done</button>
      </div>
    </section>
  </main>`;
}

bind.done = () => {
  $('[data-home]').addEventListener('click', () => { tick(); state.session = null; go('home', { back: true }); });
};

/* ------------------------------------------------------------ CALIBRATE */
const cal = { step: 'intro', result: null, error: null };

function calibrateView() {
  const r = cal.result;
  const steps = ['Put your phone where it will be while cooking.', 'Tap Start and stay quiet for 3 seconds.', 'Wait for one whistle. Seeti learns its sound.'];
  const body = {
    intro: `
      <ol class="mt-2 space-y-3">
        ${steps.map((t, i) => `<li class="flex items-center gap-4 rounded-3xl bg-paper p-4 shadow-sm"><span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-mist text-[20px] font-extrabold">${i + 1}</span><p class="text-[18px] font-semibold">${t}</p></li>`).join('')}
      </ol>
      <div class="mt-auto grid gap-3 py-5">
        <button data-cal-start class="tap btn-primary min-h-14 rounded-full text-[20px] font-extrabold">Start</button>
        ${state.calib ? '<button data-cal-clear class="tap btn-soft min-h-14 rounded-full text-[18px] font-bold">Forget my cooker</button>' : ''}
      </div>`,
    run: `
      <p id="calStatus" class="mt-2 text-center text-[24px] font-extrabold">Stay quiet for 3 seconds…</p>
      <div class="mx-auto mt-3 w-56 overflow-hidden rounded-3xl bg-[#FFD98E]">${cookerSVG({ flame: true, id: 'calSvg' })}</div>
      <div class="mt-5 h-3 overflow-hidden rounded-full bg-mist"><div id="calLevel" class="h-full w-0 rounded-full bg-brown transition-[width] duration-75"></div></div>
      <p id="calNote" class="mt-2 text-center text-[17px] text-muted"></p>
      <div class="mt-auto grid gap-3 py-5">
        <button data-cal-now disabled class="tap btn-primary min-h-14 rounded-full text-[19px] font-extrabold disabled:opacity-40">That was the whistle</button>
        <button data-cal-cancel class="tap btn-soft min-h-14 rounded-full text-[18px] font-bold">Cancel</button>
      </div>`,
    result: r ? `
      <span class="mx-auto mt-6 flex h-20 w-20 items-center justify-center rounded-full bg-leaf text-white">${I.check('h-12 w-12')}</span>
      <h2 class="mt-4 text-center text-[26px] font-extrabold">Got it</h2>
      <p class="mt-1 text-center text-[19px]">Seeti learned how your cooker sounds.</p>
      ${r.snrDb < 8
        ? '<p class="mt-4 rounded-2xl bg-mist p-4 text-[17px]">The whistle was quite soft. Keep the phone a little closer to the cooker for best results.</p>'
        : '<p class="mt-4 rounded-2xl bg-mist p-4 text-[17px]">The whistle was loud and clear ✓</p>'}
      <div class="mt-auto grid gap-3 py-5">
        <button data-cal-save class="tap btn-primary min-h-14 rounded-full text-[20px] font-extrabold">Save</button>
        <button data-cal-start class="tap btn-soft min-h-14 rounded-full text-[18px] font-bold">Try again</button>
      </div>` : '',
    fail: `
      <h2 class="mt-8 text-center text-[24px] font-extrabold">Seeti didn't hear a whistle</h2>
      <p class="mt-2 text-center text-[18px] text-ink-2">${esc(cal.error || '')}</p>
      <div class="mt-auto grid gap-3 py-5">
        <button data-cal-start class="tap btn-primary min-h-14 rounded-full text-[20px] font-extrabold">Try again</button>
        <button data-cal-cancel class="tap btn-soft min-h-14 rounded-full text-[18px] font-bold">Back</button>
      </div>`,
  }[cal.step];
  return `
  <main class="flex min-h-dvh flex-col">
    ${topBar("Learn my cooker's whistle", { back: true, sub: 'Takes about 1 minute' })}
    <div class="flex flex-1 flex-col px-5" style="padding-bottom:env(safe-area-inset-bottom)">${body}</div>
  </main>`;
}

function endCalMic() {
  calibRun?.cancel();
  calibRun = null;
  mic?.close();
  mic = null;
}

bind.calibrate = () => {
  const back = () => { endCalMic(); cal.step = 'intro'; cal.result = null; keepAwake(false); go('settings', { back: true }); };
  $('[data-back]')?.addEventListener('click', back);
  $$('[data-cal-cancel]').forEach((b) => b.addEventListener('click', back));
  $('[data-cal-clear]')?.addEventListener('click', async () => {
    if (!(await confirmSheet({ title: 'Forget your cooker?', text: 'Seeti will go back to its normal listening.', yes: 'Yes, forget' }))) return;
    remove('calib');
    state.calib = null;
    go('settings', { back: true });
    snackbar('Cooker forgotten');
  });
  $('[data-cal-save]')?.addEventListener('click', () => {
    state.calib = cal.result;
    save('calib', cal.result);
    cal.step = 'intro';
    cal.result = null;
    endCalMic();
    keepAwake(false);
    go('settings', { back: true });
    snackbar("Saved. Seeti knows your cooker's whistle");
  });
  $$('[data-cal-start]').forEach((b) => b.addEventListener('click', async () => {
    tick();
    unlockAudio();
    endCalMic();
    cal.step = 'run';
    render();
    try {
      mic = await openMic();
    } catch (e) {
      cal.step = 'fail';
      cal.error = micErrorText(e);
      render();
      return;
    }
    keepAwake(true);
    calibRun = calibrate(mic, {
      onUpdate: (u) => {
        const st = $('#calStatus');
        if (!st) return;
        st.textContent = u.phase === 'learning' ? 'Stay quiet for 3 seconds…' : u.phase === 'hearing' ? 'I hear it. Keep going…' : 'Ready. Waiting for a whistle…';
        $('#calSvg')?.classList.toggle('hearing', u.phase === 'hearing');
        const now = $('[data-cal-now]');
        if (now) now.disabled = (u.heardSec || 0) < 0.5;
        $('#calLevel').style.width = dbToPct(u.levelDb) + '%';
        $('#calNote').textContent = u.phase === 'learning' ? `${Math.round(u.progress * 100)}% ready`
          : (u.heardSec || 0) > 0 ? `Heard ${(u.heardSec || 0).toFixed(1)} seconds of whistle` : 'The bar moves when there is sound.';
      },
      onDone: (res) => {
        calibRun = null; mic?.close(); mic = null;
        cal.result = res; cal.step = 'result';
        vibrate(120); chime(); render();
      },
      onFail: (why) => {
        calibRun = null; mic?.close(); mic = null;
        cal.step = 'fail';
        cal.error = why === 'timeout'
          ? 'No whistle in 90 seconds. Try again when the cooker is about to whistle.'
          : 'The sound was too short. Wait for a full whistle (about 1 second or more).';
        render();
      },
    });
  }));
  $('[data-cal-now]')?.addEventListener('click', () => calibRun?.finishNow());
};

/* --------------------------------------------------------- page lifecycle */
document.addEventListener('visibilitychange', () => {
  if (state.screen !== 'listen' || !state.session || !mic) return;
  if (document.visibilityState === 'hidden') {
    hiddenAt = new Date();
  } else if (hiddenAt) {
    mic.resume().catch(() => {});
    if (mic.stream.getAudioTracks().some((t) => t.readyState === 'ended')) addNote('The phone turned the mic off. Tap Stop and start again.');
    if ((Date.now() - hiddenAt) / 1000 > 5) addNote(`Seeti was closed from ${fmtTime(hiddenAt)} to ${fmtTime(new Date())}. Please check the count.`);
    hiddenAt = null;
  }
});

window.addEventListener('beforeunload', (e) => {
  const s = state.session;
  if (state.screen === 'listen' && s && !s.error && s.count < s.target) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------------------------------------------------------------- start */
render();

if ('serviceWorker' in navigator && import.meta.env.PROD && !PREVIEW) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
if (!PREVIEW && state.settings.ai && 'requestIdleCallback' in window && navigator.onLine && !navigator.connection?.saveData) {
  requestIdleCallback(() => import('./yamnet.js').then((m) => m.preloadYamnet()).catch(() => {}), { timeout: 8000 });
}

window.__seeti = { state, hasVoiceFor };
