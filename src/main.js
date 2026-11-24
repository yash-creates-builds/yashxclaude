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
import { isNative, prepareNotifications, scheduleAlert, cancelAlert } from './native.js';

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

function segProgress(count, target, animateLast = false, light = false) {
  return `<div class="flex gap-1.5" aria-hidden="true">
    ${Array.from({ length: target }, (_, i) => `<div class="seg flex-1 ${light ? '!bg-mist' : ''} ${animateLast && i === count - 1 ? 'fill' : ''}">${i < count ? `<i ${light ? 'style="background:var(--brown)"' : ''}></i>` : ''}</div>`).join('')}
  </div>`;
}

// Bottom sheet with big choices (no pop-up dialogs). Resolves with the chosen value (null = dismissed).
function actionSheet({ title, text, actions }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'sheet-bg fixed inset-0 z-40 flex items-end justify-center bg-ink/40';
    el.innerHTML = `<div class="sheet w-full max-w-md rounded-t-[32px] bg-paper px-6 pt-3 text-ink" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="padding-bottom:max(1.5rem,env(safe-area-inset-bottom))">
      <div class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-sand"></div>
      <h2 class="text-[22px] font-extrabold">${esc(title)}</h2>
      <p class="mt-1 text-[17px] text-muted">${esc(text)}</p>
      <div class="mt-5 grid gap-2">
        ${actions.map((a, i) => `<button data-act="${i}" class="tap min-h-14 rounded-full text-[18px] font-bold ${a.danger ? 'bg-mirch text-white' : a.primary ? 'btn-primary' : 'btn-soft'}">${esc(a.label)}</button>`).join('')}
      </div></div>`;
    document.body.appendChild(el);
    const close = (v) => { el.remove(); resolve(v); };
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { tick(); close(actions[Number(b.dataset.act)].value); }));
    el.addEventListener('click', (e) => { if (e.target === el) close(null); });
    el.querySelector('[data-act]').focus();
  });
}

async function confirmSheet({ title, text, yes, no = 'Cancel', danger = false }) {
  const v = await actionSheet({ title, text, actions: [{ label: yes, value: true, primary: !danger, danger }, { label: no, value: false }] });
  return v === true;
}

// Snackbar with an optional action (e.g. Undo), auto-hides.
const PANEL_HINT = 'Missed a whistle? Tap <b class="mx-1">+</b> Wrong sound? Tap <b class="ml-1">−</b>';

function snackbar(text, action, onAction, ms = 6000) {
  document.querySelector('.snack')?.remove();
  clearTimeout(snackTimer);
  // On the listening screen the message lives inside the bottom panel, so it never covers the count.
  const slot = document.getElementById('panelMsg');
  if (slot) {
    slot.innerHTML = `<span class="snack flex w-full items-center gap-3 rounded-2xl bg-ink px-4 py-2 text-left text-cream"><span class="flex-1 text-[16px] font-semibold">${esc(text)}</span>${action ? `<button class="tap flex min-h-10 items-center gap-1.5 rounded-full px-2 text-[16px] font-extrabold text-haldi">${I.undo('h-5 w-5')}${esc(action)}</button>` : ''}</span>`;
    slot.querySelector('button')?.addEventListener('click', () => { tick(); slot.innerHTML = PANEL_HINT; onAction?.(); });
    snackTimer = setTimeout(() => { if (document.getElementById('panelMsg') === slot) slot.innerHTML = PANEL_HINT; }, ms);
    return;
  }
  const el = document.createElement('div');
  el.className = 'snack fixed inset-x-3 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-cream shadow-xl';
  const overPanel = state.screen === 'listen' && state.session && !state.session.error && state.session.cookers.length === 1;
  el.style.bottom = `calc(${overPanel ? 176 : 96}px + env(safe-area-inset-bottom))`;
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

function addHistory(c, s) {
  state.history = [{ dishId: c.dish.id, name: c.dish.name, count: c.count, at: Date.now(),
    mins: c.finishedAt ? Math.max(1, Math.round((c.finishedAt - s.startedAt) / 60000)) : null }, ...state.history].slice(0, 20);
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
const newCooker = (dish, target) => ({ dish, target, count: 0, finishedAt: null, releaseEnd: null, released: false, extraMs: 0 });
const openCookers = (s = state.session) => s.cookers.map((c, i) => i).filter((i) => s.cookers[i].count < s.cookers[i].target);
const isMulti = (s = state.session) => s.cookers.length > 1;
const say = (text) => speak(text, state.settings.lang);
const V = () => VOICE[state.settings.lang];

let watchTimer = null;
let releaseTicker = null;
let whichSheet = null;

async function startSession(targetOverride) {
  const d = selected();
  state.session = {
    cookers: [newCooker(d, targetOverride ?? d.count)],
    log: [], startedAt: new Date(), phase: 'learning', error: null,
    unassigned: 0, lastWhistleAt: null, nudgedAt: null, flags: {},
  };
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
    onWhistle: ({ source, at }) => onDetected(source, at),
    onPhase: (p) => { if (state.session) { state.session.phase = p; updateStatus(); } },
  });
  detector.start();
  keepAwake(true).then(updateWakeNote);
  say(V().hello);
  prepareNotifications();
  if (state.settings.ai) startAiLayer();
  clearInterval(watchTimer);
  watchTimer = setInterval(watchdog, 1000);
  try {
    const b = await navigator.getBattery?.();
    if (b && !b.charging && b.level < 0.15) addNote('Battery low. Plug in so Seeti keeps listening.');
  } catch { /* not supported */ }
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
  clearInterval(watchTimer);
  watchTimer = null;
  cancelAnimationFrame(meterRaf);
  document.querySelector('.snack')?.remove();
  closeWhich();
}

function endSession() {
  state.session?.cookers.forEach((_, i) => cancelAlert(100 + i));
  stopListening();
  clearInterval(releaseTicker);
  releaseTicker = null;
  keepAwake(false);
}

/* Checks every second: silent mic, non-stop noise, and "no whistle for too long". */
function watchdog() {
  const s = state.session;
  if (!s || !detector || state.screen !== 'listen') return;
  const L = detector.live;
  if (L.phase === 'learning') return;

  if (L.deadFor >= 30 && !s.flags.dead) {
    s.flags.dead = true;
    vibrate([300, 100, 300]);
    addNote("I can't hear anything. Is something covering the mic?");
    snackbar("I can't hear anything. Check the mic.");
  } else if (L.deadFor === 0) {
    s.flags.dead = false;
  }

  if (L.loudFor >= 30 && !s.flags.noisy && state.settings.sens !== 'low') {
    s.flags.noisy = true;
    noisySheet();
  }

  if (!openCookers().length || document.querySelector('.alarm')) return;
  const times = s.log.filter((e) => e.n).map((e) => +new Date(e.time));
  let limit = 15 * 60_000;
  if (times.length >= 2) {
    const avgGap = (times.at(-1) - times[0]) / (times.length - 1);
    limit = Math.max(3 * 60_000, 2 * avgGap);
  }
  const since = s.nudgedAt || s.lastWhistleAt || +s.startedAt;
  if (Date.now() - since > limit) {
    s.nudgedAt = Date.now();
    nudgeSheet();
  }
}

async function nudgeSheet() {
  vibrate([400, 150, 400]);
  chime();
  say(V().noWhistle);
  const v = await actionSheet({
    title: 'No whistle yet',
    text: 'Is the gas on? Is the phone near the cooker?',
    actions: [
      { label: 'Keep listening', value: 'keep', primary: true },
      { label: 'Move phone closer', value: 'closer' },
      { label: 'Count by hand', value: 'hand' },
    ],
  });
  if (v === 'closer') snackbar('Keep the phone 1–2 metres from the cooker, mic facing it.');
  if (v === 'hand') {
    stopListening();
    state.session.phase = 'manual';
    keepAwake(true);
    render();
    addNote('Counting by hand. Tap +1 for each whistle.');
  }
}

async function noisySheet() {
  vibrate(200);
  const v = await actionSheet({
    title: "It's very noisy",
    text: 'I may miss a whistle or count a wrong sound. A stricter setting can help.',
    actions: [
      { label: 'Use "Noisy kitchen" setting', value: 'low', primary: true },
      { label: 'Keep as it is', value: 'keep' },
    ],
  });
  if (v === 'low') {
    state.settings.sens = 'low';
    saveSettings();
    detector?.setParams(buildParams(state.calib, 'low'));
    snackbar('Switched to Noisy kitchen');
  }
}

/* A whistle was heard: give it to the right cooker. */
function onDetected(source, at) {
  const s = state.session;
  if (!s) return;
  const open = openCookers();
  if (!open.length) return;
  s.lastWhistleAt = Date.now();
  if (open.length === 1) return countWhistle(open[0], source, at);
  askWhich(source, at);
}

function closeWhich() {
  whichSheet?.el.remove();
  clearTimeout(whichSheet?.timer);
  whichSheet = null;
}

// "Which cooker whistled?" — big buttons; no answer in 15 s → kept as "not assigned".
function askWhich(source, at, fromChip = false) {
  const s = state.session;
  if (whichSheet) { if (!fromChip) { s.unassigned += 1; renderCards(); } return; }
  const open = openCookers();
  vibrate([150, 80, 150]);
  if (!fromChip) { chime(); say(V().which); }
  const el = document.createElement('div');
  el.className = 'sheet-bg fixed inset-0 z-40 flex items-end justify-center bg-ink/40';
  el.innerHTML = `<div class="sheet w-full max-w-md rounded-t-[32px] bg-paper px-6 pt-3 text-ink" role="dialog" aria-modal="true" aria-label="Which cooker whistled?" style="padding-bottom:max(1.5rem,env(safe-area-inset-bottom))">
    <div class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-sand"></div>
    <h2 class="text-[24px] font-extrabold">Which cooker whistled?</h2>
    <div class="mt-4 grid grid-cols-2 gap-3">
      ${open.map((i) => { const c = s.cookers[i]; return `<button data-pick="${i}" class="tap flex flex-col items-center gap-1 rounded-3xl p-4" style="background:${DISH_BG[c.dish.id] || DISH_BG.custom}">
        <span class="text-[44px] leading-none">${c.dish.emoji}</span><span class="text-[19px] font-extrabold">${esc(c.dish.name)}</span><span class="text-[15px] font-semibold text-ink-2">${c.count} of ${c.target}</span></button>`; }).join('')}
    </div>
    <button data-pick="none" class="tap btn-soft mt-3 min-h-14 w-full rounded-full text-[18px] font-bold">Neither, it wasn't a whistle</button>
    ${fromChip ? '' : '<p class="mt-3 text-center text-[15px] text-muted">No answer in 15 seconds? I\'ll keep it for later.</p>'}
  </div>`;
  document.body.appendChild(el);
  whichSheet = { el, timer: null };
  const done = (v) => {
    closeWhich();
    if (v === 'later') { s.unassigned += 1; renderCards(); return; }
    if (fromChip) { s.unassigned = Math.max(0, s.unassigned - 1); renderCards(); }
    if (v !== 'none') countWhistle(Number(v), fromChip ? 'manual' : source, at, true);
  };
  el.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { tick(); done(b.dataset.pick); }));
  if (!fromChip) whichSheet.timer = setTimeout(() => done('later'), 15_000);
  else el.addEventListener('click', (e) => { if (e.target === el) closeWhich(); });
}

function countWhistle(i, source = 'sound', at = new Date(), chosen = false) {
  const s = state.session;
  const c = s?.cookers[i];
  if (!c || c.count >= c.target) return;
  c.count += 1;
  s.log.push({ n: c.count, ci: i, time: at, source });
  vibrate(source === 'manual' ? 30 : [180, 80, 180]);
  puff($('#liveCooker'));
  updateCount(true);
  renderLog();
  const prefix = isMulti() ? `${c.dish.name}. ` : '';
  if (c.count >= c.target) { cookerDone(i); return; }
  chime();
  const left = c.target - c.count;
  setTimeout(() => say(prefix + V().count(c.count) + (left === 1 ? '. ' + V().oneLeft : '')), 350);
  if (source !== 'manual' && !chosen) {
    snackbar(`${isMulti() ? c.dish.name + ': ' : ''}${ordinal(c.count)} whistle counted`, 'Undo', () => undoWhistle(i));
  }
}

function undoWhistle(i) {
  const s = state.session;
  const c = s?.cookers[i];
  if (!c || c.count === 0 || c.finishedAt) return;
  for (let k = s.log.length - 1; k >= 0; k--) {
    if (s.log[k].n === c.count && s.log[k].ci === i) { s.log.splice(k, 1); break; }
  }
  c.count -= 1;
  vibrate(30);
  updateCount();
  renderLog();
}

function addNote(text) {
  state.session?.log.push({ type: 'note', text, time: new Date() });
  renderLog();
}

// One cooker reached its whistles.
function cookerDone(i) {
  const s = state.session;
  const c = s.cookers[i];
  c.finishedAt = new Date();
  addHistory(c, s);
  if (!openCookers().length) stopListening();
  queueAlarm({
    title: { hi: 'Gas band karo!', en: 'Turn off the gas!', gu: 'ગેસ બંધ કરો!' },
    sub: 'Turn off the gas!',
    kind: 'gasOff',
    dish: c.dish.name,
    onStop: () => afterGasOff(i),
  });
}

function afterGasOff(i) {
  const s = state.session;
  const c = s.cookers[i];
  if (state.settings.releaseOn) {
    c.releaseEnd = Date.now() + state.settings.releaseMin * 60_000;
    scheduleAlert(100 + i, `${c.dish.name}: safe to open now`, 'The pressure is out. Check the cooker, then open it.', new Date(c.releaseEnd));
  } else c.released = true;
  if (!isMulti()) {
    if (c.releaseEnd) { keepAwake(true); go('release'); } else { endSession(); go('done'); }
    return;
  }
  // Two cookers: timers live on the cards; the other cooker keeps counting.
  render();
  startReleaseTicker();
  maybeAllDone();
}

function startReleaseTicker() {
  if (releaseTicker) return;
  releaseTicker = setInterval(() => {
    const s = state.session;
    if (!s) return;
    s.cookers.forEach((c, i) => {
      if (!c.releaseEnd || c.released) return;
      const left = c.releaseEnd - Date.now();
      const el = $(`[data-rel-left="${i}"]`);
      if (el) el.textContent = fmtLeft(left);
      if (left <= 0) {
        c.released = true;
        queueAlarm({
          title: { hi: 'Cooker khol sakte ho!', en: 'Safe to open now!', gu: 'કૂકર ખોલી શકો!' },
          sub: 'Safe to open now!',
          kind: 'released',
          dish: c.dish.name,
          onStop: () => { renderCards(); maybeAllDone(); },
        });
      }
    });
  }, 500);
}

function maybeAllDone() {
  const s = state.session;
  if (!s || openCookers().length || s.cookers.some((c) => !c.released) || document.querySelector('.alarm')) return;
  endSession();
  go('done');
}

const fmtLeft = (ms) => { const t = Math.max(0, ms); return `${String(Math.floor(t / 60000)).padStart(2, '0')}:${String(Math.floor((t % 60000) / 1000)).padStart(2, '0')}`; };

/* ---------------------------------------------------------------- LISTEN */
function logList(log) {
  const multi = isMulti();
  if (!log.length) return `<p class="py-2 text-[16px] text-sand">Each whistle shows up here with its time.</p>`;
  return `<ol class="space-y-2">${log.map((e, i) => {
    const fresh = i === log.length - 1 ? 'arrive' : '';
    if (e.type === 'note') return `<li class="${fresh} rounded-2xl bg-brown-2 px-4 py-2.5 text-[16px] text-cream">${esc(e.text)}</li>`;
    const dish = multi ? state.session.cookers[e.ci].dish : null;
    return `<li class="${fresh} flex items-center gap-3 rounded-2xl bg-brown-2 px-4 py-2.5">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-haldi text-ink">${dish ? `<span class="text-[17px]">${dish.emoji}</span>` : I.check('h-5 w-5')}</span>
        <span class="flex-1 text-[18px] font-bold">${dish ? `${esc(dish.name)} · ` : ''}${ordinal(e.n)} whistle${e.source === 'manual' ? ' <span class="text-[15px] font-semibold text-sand">· by you</span>' : ''}</span>
        <span class="text-[15px] text-sand">${fmtTime(e.time)}</span>
      </li>`;
  }).join('')}</ol>`;
}

function cookerCard(c, i) {
  const open = c.count < c.target;
  const status = open ? `${c.target - c.count} to go`
    : c.released ? 'Ready ✓'
    : c.releaseEnd ? `Safe in <span data-rel-left="${i}" class="tabular-nums">${fmtLeft(c.releaseEnd - Date.now())}</span>`
    : 'Gas off now';
  return `<div class="rounded-[28px] bg-paper p-4 text-ink ${open ? '' : 'ring-4 ring-leaf'}">
    <div class="flex items-center gap-2">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-2xl" style="background:${DISH_BG[c.dish.id] || DISH_BG.custom}">${c.dish.emoji}</span>
      <span class="min-w-0 truncate text-[19px] font-extrabold">${esc(c.dish.name)}</span>
    </div>
    <p class="mt-3 leading-none"><span class="text-[64px] font-extrabold tabular-nums">${c.count}</span><span class="text-[22px] font-extrabold text-muted"> / ${c.target}</span></p>
    <div class="mt-3">${segProgress(c.count, c.target, false, true)}</div>
    <p class="mt-2 text-[16px] font-bold text-ink-2">${status}</p>
    ${open ? `<div class="mt-3 grid grid-cols-2 gap-2">
      <button data-cminus="${i}" class="tap btn-soft flex h-12 items-center justify-center rounded-xl text-2xl font-bold" aria-label="Remove one whistle from ${esc(c.dish.name)}">−</button>
      <button data-cplus="${i}" class="tap btn-soft flex h-12 items-center justify-center rounded-xl text-2xl font-bold" aria-label="Add one whistle to ${esc(c.dish.name)}">+</button></div>` : ''}
  </div>`;
}

function renderCards() {
  const s = state.session;
  const el = $('#cards');
  if (el && s) el.innerHTML = s.cookers.map(cookerCard).join('');
  const chip = $('#unassigned');
  if (chip && s) {
    chip.classList.toggle('hidden', !s.unassigned || !openCookers().length);
    chip.classList.toggle('flex', !!s.unassigned && !!openCookers().length);
    chip.querySelector('span').textContent = `${s.unassigned} whistle${s.unassigned === 1 ? '' : 's'} not assigned · tap to choose`;
  }
}

const lastWhistleText = (s) => { const w = s.log.filter((e) => e.n).at(-1); return w ? fmtTime(w.time) : '—'; };

/*
  Listening screen, modelled on the storybook "detail" page:
  illustration on top → brown sheet with the big count as the title, a round ear button,
  status chips, a stats row → a white bottom panel with grey − / + squares to fix the count.
*/
function listen() {
  const s = state.session;
  if (s.error) {
    return `
    <main class="flex min-h-dvh flex-col">
      ${topBar(esc(s.cookers[0].dish.name), { back: true })}
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
  const multi = isMulti();
  const c0 = s.cookers[0];
  const listening = s.phase !== 'manual' && openCookers(s).length > 0;
  const chip = (inner, id = '') => `<span ${id ? `id="${id}"` : ''} class="inline-flex min-h-10 items-center gap-2 rounded-full bg-brown-2 px-4 text-[16px] font-bold">${inner}</span>`;

  return `
  <main class="flex min-h-dvh flex-col bg-brown text-cream">
    <div class="relative overflow-hidden bg-[#FFD98E]">
      <div class="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4" style="padding-top:max(.75rem,env(safe-area-inset-top))">
        <button data-stop class="tap flex min-h-12 items-center gap-2 rounded-full bg-white/90 px-4 text-[17px] font-bold text-ink shadow-sm" aria-label="Stop listening">${I.back('h-5 w-5')} Stop</button>
        <span id="aiBadge" class="hidden rounded-full bg-white/90 px-3 py-2 text-[14px] font-bold text-ink shadow-sm">✦ Smart listening</span>
      </div>
      <div class="absolute inset-x-0 bottom-0 border-t-[3px] border-ink bg-brown-3" style="height:calc(32px + ${multi ? 'min(240px, 26dvh)' : 'min(290px, 30dvh)'} * 0.1)" aria-hidden="true"></div>
      <div id="cookerWrap" class="relative mx-auto w-full pb-8 pt-14" style="max-width:${multi ? 'min(240px, 26dvh)' : 'min(290px, 30dvh)'}">${cookerSVG({ scene: true, id: 'liveCooker' })}</div>
    </div>

    <section class="relative -mt-10 flex-1 rounded-t-[36px] bg-brown px-6 pt-7" style="padding-bottom:calc(${multi ? 32 : 168}px + env(safe-area-inset-bottom))">
      ${multi ? `
        <div class="flex items-center justify-between gap-4">
          <div><h1 class="text-[30px] font-extrabold leading-tight">Two cookers</h1>
          <p class="text-[17px] font-semibold text-sand">Seeti asks which one whistled.</p></div>
          ${earButton()}
        </div>
        <button id="unassigned" class="tap mt-4 hidden w-full items-center gap-2 rounded-2xl bg-haldi px-4 py-3 text-left text-[17px] font-bold text-ink">${I.bell('h-5 w-5 shrink-0')}<span></span></button>
        <div id="cards" class="mt-4 grid grid-cols-2 gap-3"></div>` : `
        <div class="flex items-end justify-between gap-4">
          <div class="min-w-0">
            <p class="text-[19px] font-bold text-sand">${c0.dish.emoji} ${esc(c0.dish.name)}</p>
            <p class="mt-1 leading-none" aria-live="polite"><span id="bigCount" class="text-[112px] font-extrabold tabular-nums tracking-tight">${c0.count}</span><span class="text-[30px] font-extrabold text-sand"> / ${c0.target}</span></p>
            <p class="mt-1 text-[19px] font-bold">whistles</p>
          </div>
          ${earButton()}
        </div>
        <div class="mt-5" id="progress">${segProgress(c0.count, c0.target)}</div>`}

      <div class="mt-5 flex flex-wrap gap-2">
        ${chip(`<span class="live-dot ${listening ? '' : 'hidden'}"></span><span id="status"></span><span id="dots" class="dots"><span></span><span></span><span></span></span>`)}
        ${multi ? '' : chip(`<span id="toGo">${c0.target - c0.count} to go</span>`)}
      </div>

      <div class="mt-5 grid grid-cols-2 border-y border-brown-2 py-4">
        <div class="flex items-center gap-3">${I.clock('h-6 w-6 text-sand')}<div><p class="text-[18px] font-extrabold leading-tight">${fmtTime(s.startedAt)}</p><p class="text-[14px] font-semibold text-sand">Started</p></div></div>
        <div class="flex items-center gap-3 border-l border-brown-2 pl-4">${I.bell('h-6 w-6 text-sand')}<div><p id="lastAt" class="text-[18px] font-extrabold leading-tight">${lastWhistleText(s)}</p><p class="text-[14px] font-semibold text-sand">Last whistle</p></div></div>
      </div>

      <div class="mt-5 ${listening ? '' : 'hidden'}">
        <div class="flex items-center justify-between"><h2 class="text-[17px] font-extrabold">Sound</h2><span class="text-[14px] font-semibold text-sand">whistle must pass the yellow line</span></div>
        <div class="relative mt-2 h-4 overflow-hidden rounded-full bg-brown-2" aria-hidden="true">
          <div id="meterLevel" class="h-full w-0 rounded-full bg-sand transition-[width] duration-75"></div>
          <div id="meterThr" class="absolute top-0 h-full w-1.5 rounded bg-haldi" style="left:0"></div>
        </div>
        <p id="meterNote" class="mt-2 text-[17px] text-sand">Getting ready…</p>
      </div>

      ${!multi && listening ? '<button data-add class="tap mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-brown-2 text-[17px] font-bold">+ Add a second cooker</button>' : ''}

      <h2 class="mt-7 text-[19px] font-extrabold">Whistles</h2>
      <div id="log" class="mt-3">${logList(s.log)}</div>
    </section>

    ${multi ? '' : `
    <div class="fixed inset-x-0 bottom-0 z-20" style="padding-bottom:env(safe-area-inset-bottom)">
      <div class="mx-auto max-w-md rounded-t-[28px] bg-paper px-5 pb-4 pt-4 text-ink shadow-[0_-8px_24px_rgba(59,35,20,.18)]">
        <div class="flex items-center gap-3">
          <button data-minus class="tap btn-soft flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-bold" aria-label="Remove one whistle">−</button>
          <div class="flex h-16 flex-1 flex-col items-center justify-center rounded-2xl bg-mist">
            <span id="panelCount" class="text-[24px] font-extrabold leading-none tabular-nums">${c0.count} of ${c0.target}</span>
            <span class="text-[13px] font-semibold text-muted">fix the count</span>
          </div>
          <button data-plus class="tap btn-primary flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-bold" aria-label="Add one whistle">+</button>
        </div>
        <div id="panelMsg" class="mt-2 flex min-h-12 items-center justify-center text-center text-[15px] text-muted" aria-live="polite">Missed a whistle? Tap <b class="mx-1">+</b> Wrong sound? Tap <b class="ml-1">−</b></div>
      </div>
    </div>`}
  </main>`;
}

// Round dark ear button (like the "listen" button in the reference). Ring fills while a whistle is held.
function earButton() {
  return `<div class="relative h-[76px] w-[76px] shrink-0" aria-hidden="true">
    <span class="absolute inset-0 rounded-full bg-ink"></span>
    <svg viewBox="0 0 76 76" class="absolute inset-0 -rotate-90">
      <circle cx="38" cy="38" r="35" fill="none" stroke="rgba(255,248,239,.18)" stroke-width="4"/>
      <circle id="earRing" class="ear-ring" cx="38" cy="38" r="35" fill="none" stroke="var(--haldi)" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>
    </svg>
    <span id="earDot" class="absolute inset-3 rounded-full bg-cream/15 transition-transform duration-100"></span>
    <span class="absolute inset-0 flex items-center justify-center text-cream">${I.ear('h-8 w-8')}</span>
  </div>`;
}

bind.listen = () => {
  const s = state.session;
  if (s.error) {
    $('[data-back]').addEventListener('click', () => { endSession(); go('home', { back: true }); });
    $('[data-retry]').addEventListener('click', () => startSession(s.cookers[0].target));
    $('[data-manual]').addEventListener('click', () => { s.error = null; s.phase = 'manual'; render(); keepAwake(true); });
    return;
  }
  $('[data-stop]').addEventListener('click', async () => {
    tick();
    const counted = s.cookers.reduce((a, c) => a + c.count, 0);
    const unfinished = openCookers().length;
    if (counted > 0 && unfinished && !(await confirmSheet({ title: 'Stop counting?', text: 'The whistles counted so far will be lost.', yes: 'Yes, stop', no: 'Keep counting', danger: true }))) return;
    endSession();
    go('home', { back: true });
  });
  const manualPlus = (i) => { detector?.pauseFor(6); s.lastWhistleAt = Date.now(); countWhistle(i, 'manual'); };
  const manualMinus = (i) => {
    const c = s.cookers[i];
    if (!c.count) return snackbar('Nothing to remove yet');
    undoWhistle(i);
    snackbar(`Removed. ${isMulti() ? c.dish.name + ': ' : 'Now '}${c.count} of ${c.target}`);
  };
  $('[data-plus]')?.addEventListener('click', () => manualPlus(0));
  $('[data-minus]')?.addEventListener('click', () => manualMinus(0));
  $('#cards')?.addEventListener('click', (e) => {
    const p = e.target.closest('[data-cplus]');
    const m = e.target.closest('[data-cminus]');
    if (p) manualPlus(Number(p.dataset.cplus));
    if (m) manualMinus(Number(m.dataset.cminus));
  });
  $('#unassigned')?.addEventListener('click', () => { tick(); askWhich('manual', new Date(), true); });
  $('[data-add]')?.addEventListener('click', addCookerSheet);
  renderCards();
  updateStatus();
  updateWakeNote();
  if (detector) meterLoop();
  if (isMulti()) startReleaseTicker();
};

// Pick the second cooker's dish.
function addCookerSheet() {
  tick();
  const el = document.createElement('div');
  el.className = 'sheet-bg fixed inset-0 z-40 flex items-end justify-center bg-ink/40';
  el.innerHTML = `<div class="sheet w-full max-w-md rounded-t-[32px] bg-paper px-6 pt-3 text-ink" role="dialog" aria-modal="true" aria-label="Add a second cooker" style="padding-bottom:max(1.5rem,env(safe-area-inset-bottom))">
    <div class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-sand"></div>
    <h2 class="text-[22px] font-extrabold">What's in the second cooker?</h2>
    <p class="mt-1 text-[16px] text-muted">When a whistle comes, Seeti will ask which cooker it was.</p>
    <div class="mt-4 grid grid-cols-3 gap-3">
      ${state.dishes.map((x) => `<button data-adddish="${x.id}" class="tap flex flex-col items-center gap-1 rounded-3xl p-3" style="background:${DISH_BG[x.id]}">
        <span class="text-[36px] leading-none">${x.emoji}</span><span class="text-[16px] font-bold leading-tight">${x.id === 'custom' ? 'Other' : x.name}</span><span class="text-[14px] font-semibold text-ink-2">${x.count} whistles</span></button>`).join('')}
    </div>
    <button data-addcancel class="tap btn-soft mt-4 min-h-14 w-full rounded-full text-[18px] font-bold">Cancel</button>
  </div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelector('[data-addcancel]').addEventListener('click', close);
  el.querySelectorAll('[data-adddish]').forEach((b) => b.addEventListener('click', () => {
    tick();
    const d = state.dishes.find((x) => x.id === b.dataset.adddish);
    state.session.cookers.push(newCooker(d, d.count));
    close();
    render();
    snackbar(`${d.name} added. Seeti will ask which cooker whistled.`);
  }));
}

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
  if (!detector && s.phase !== 'manual') text = openCookers().length ? 'Mic off' : 'All whistles done';
  const c0 = s.cookers[0];
  if (!isMulti() && s.phase === 'listening' && c0.target - c0.count === 1) text = 'Bas ek aur · one more';
  el.textContent = text;
  $('#dots')?.classList.toggle('hidden', !detector || ['cooldown', 'manual'].includes(s.phase));
  $('#aiBadge')?.classList.toggle('hidden', state.aiStatus !== 'on');
  $('#liveCooker')?.classList.toggle('hearing', s.phase === 'hearing');
}

function updateCount(added = false) {
  const s = state.session;
  const last = $('#lastAt');
  if (last) last.textContent = lastWhistleText(s);
  if (isMulti()) { renderCards(); updateStatus(); return; }
  const c = s.cookers[0];
  const big = $('#bigCount');
  if (big) {
    big.textContent = c.count;
    big.classList.remove('pop');
    void big.offsetWidth;
    big.classList.add('pop');
    big.style.display = 'inline-block';
  }
  const pc = $('#panelCount');
  if (pc) pc.textContent = `${c.count} of ${c.target}`;
  const tg = $('#toGo');
  if (tg) tg.textContent = c.count >= c.target ? 'Done' : `${c.target - c.count} to go`;
  const pg = $('#progress');
  if (pg) pg.innerHTML = segProgress(c.count, c.target, added);
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
        : L.deadFor > 5 ? "I can't hear anything"
        : L.phase === 'cooldown' ? `Listening again in ${Math.ceil(L.cooldownLeft)} sec`
        : L.hot ? 'Sounds like a whistle. Keep going…'
        : L.levelDb > L.baseline + 4 ? 'Some sound, not a whistle'
        : 'Quiet kitchen';
    }
  }
  meterRaf = requestAnimationFrame(meterLoop);
}

/* ----------------------------------------------------------------- ALARM */
const alarmQueue = [];

function queueAlarm(opts) {
  if (document.querySelector('.alarm')) { alarmQueue.push(opts); return; }
  showAlarm(opts);
}

function showAlarm({ title, sub, kind, dish, onStop }) {
  const lang = state.settings.lang;
  const multi = state.session && isMulti();
  const overlay = document.createElement('div');
  overlay.className = 'alarm fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center text-white';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-label', (multi ? dish + ': ' : '') + title.en);
  overlay.tabIndex = 0;
  const c = state.session?.cookers.find((x) => x.dish.name === dish);
  overlay.innerHTML = `
    <span class="shake flex h-28 w-28 items-center justify-center rounded-full bg-white/20">${kind === 'gasOff' ? I.fire('h-16 w-16') : I.bell('h-16 w-16')}</span>
    ${multi ? `<p class="mt-6 rounded-full bg-white/20 px-5 py-2 text-[24px] font-extrabold">${esc(dish)}</p>` : ''}
    <h1 class="mt-4 text-[46px] font-extrabold leading-tight">${esc(title[lang] || title.en)}</h1>
    ${lang !== 'en' ? `<p class="mt-2 text-[24px] font-bold">${esc(sub)}</p>` : ''}
    ${c ? `<p class="mt-4 text-[19px] font-semibold">${esc(c.dish.name)} · ${c.count} ${plural(c.count)}</p>` : ''}
    <button class="tap mt-10 min-h-16 rounded-full bg-white px-10 text-[22px] font-extrabold text-[#B3121C]">OK, done ✓</button>
    <p class="mt-3 text-[16px] font-semibold text-white/90">Tap anywhere to stop the sound</p>`;
  document.body.appendChild(overlay);
  overlay.focus();
  startAlarm(lang, kind, multi ? dish : '');
  if (document.hidden) scheduleAlert(kind === 'gasOff' ? 300 : 301, `${dish}: ${title.en}`, sub);
  detector?.pauseFor(3600); // don't count the alarm's own beeps as a whistle
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    stopAlarm();
    detector?.pauseFor(2);
    overlay.remove();
    onStop?.();
    const next = alarmQueue.shift();
    if (next) showAlarm(next);
  };
  overlay.addEventListener('click', stop, { once: true });
  overlay.addEventListener('keydown', (e) => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); stop(); } });
}

/* --------------------------------------------------------------- RELEASE (one cooker) */
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
  const c = state.session.cookers[0];
  const total = () => state.settings.releaseMin * 60_000 + (c.extraMs || 0);
  const tickClock = () => {
    const left = Math.max(0, c.releaseEnd - Date.now());
    const clock = $('#clock');
    if (!clock) return;
    clock.textContent = fmtLeft(left);
    $('#ring').setAttribute('stroke-dashoffset', String(100 - (left / total()) * 100));
    if (left <= 0) {
      clearInterval(releaseTimer);
      document.removeEventListener('visibilitychange', tickClock);
      if (document.querySelector('.alarm')) return;
      c.released = true;
      showAlarm({
        title: { hi: 'Cooker khol sakte ho!', en: 'Safe to open now!', gu: 'કૂકર ખોલી શકો!' },
        sub: 'Safe to open now!',
        kind: 'released',
        dish: c.dish.name,
        onStop: () => { endSession(); go('done'); },
      });
    }
  };
  clearInterval(releaseTimer);
  releaseTimer = setInterval(tickClock, 250);
  document.addEventListener('visibilitychange', tickClock);
  tickClock();
  $('[data-addmin]').addEventListener('click', () => { tick(); c.releaseEnd += 60_000; c.extraMs = (c.extraMs || 0) + 60_000; scheduleAlert(100, `${c.dish.name}: safe to open now`, 'The pressure is out. Check the cooker, then open it.', new Date(c.releaseEnd)); tickClock(); snackbar('Added 1 minute'); });
  $('[data-skip]').addEventListener('click', () => { tick(); clearInterval(releaseTimer); document.removeEventListener('visibilitychange', tickClock); endSession(); go('done'); });
};

/* ------------------------------------------------------------------ DONE */
function done() {
  const s = state.session;
  const lines = s.cookers.map((c) => {
    const mins = c.finishedAt ? Math.max(1, Math.round((c.finishedAt - s.startedAt) / 60000)) : null;
    return `${esc(c.dish.name)} · ${c.count} ${plural(c.count)}${mins ? ` · ${mins} min` : ''}`;
  });
  return `
  <main class="flex min-h-dvh flex-col bg-brown text-cream">
    <div class="overflow-hidden bg-[#FFD98E] pt-6">${cookerSVG({ count: isMulti() ? null : s.cookers[0].count, scene: true, flame: false })}</div>
    <section class="relative -mt-8 flex flex-1 flex-col rounded-t-[32px] bg-brown px-5 pt-6" style="padding-bottom:max(1.25rem,env(safe-area-inset-bottom))">
      <h1 class="text-[32px] font-extrabold">Ho gaya! Khana tayyar.</h1>
      ${lines.map((l) => `<p class="mt-1 text-[18px] text-sand">${l}</p>`).join('')}
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
    if ((Date.now() - hiddenAt) / 1000 > 5) addNote(`Listening paused from ${fmtTime(hiddenAt)} to ${fmtTime(new Date())}. Please check the count.`);
    hiddenAt = null;
  }
});

window.addEventListener('beforeunload', (e) => {
  const s = state.session;
  if (state.screen === 'listen' && s && !s.error && openCookers(s).length) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------------------------------------------------------------- start */
render();

if ('serviceWorker' in navigator && import.meta.env.PROD && !PREVIEW && !isNative) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
if (!PREVIEW && state.settings.ai && 'requestIdleCallback' in window && navigator.onLine && !navigator.connection?.saveData) {
  requestIdleCallback(() => import('./yamnet.js').then((m) => m.preloadYamnet()).catch(() => {}), { timeout: 8000 });
}

window.__seeti = { state, hasVoiceFor };
