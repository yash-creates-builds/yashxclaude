import './style.css';

import { getDishes, setDishCount, resetDishes, MIN_COUNT, MAX_COUNT } from './presets.js';
import { load, save, remove } from './store.js';
import { LANGS, VOICE, ordinal } from './i18n.js';
import { unlockAudio, chime, startAlarm, stopAlarm, vibrate, speak, keepAwake, isAwake, hasVoiceFor } from './alerts.js';
import { openMic } from './audio.js';
import { WhistleDetector, buildParams, calibrate } from './detector.js';
import { cookerSVG, puff } from './cooker.js';
import { I } from './icons.js';

/* Design notes: built for women 18–70 who use WhatsApp and YouTube daily.
   - Familiar patterns: chat-list rows, green header, chat bubbles with ✓✓, red progress bar, ▶ start.
   - 18px base text, 56px+ tap targets, every icon has a text label, no swipe-only controls.
   - Plain words only: no "dB", "kHz" or "sensitivity". */

/* ------------------------------------------------------------------ state */
const app = document.getElementById('app');
const PREVIEW = import.meta.env.VITE_PREVIEW === '1'; // design-preview build (no microphone)

const state = {
  screen: 'home',
  dishes: getDishes(),
  selectedId: load('lastDish', 'dal'),
  settings: { lang: 'hi', releaseOn: true, releaseMin: 10, sens: 'normal', ai: true, ...load('settings', {}) },
  calib: load('calib', null),
  session: null,
  aiStatus: 'off', // off | loading | on | error
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

const $ = (sel, root = app) => root.querySelector(sel);
const $$ = (sel, root = app) => [...root.querySelectorAll(sel)];
const selected = () => state.dishes.find((d) => d.id === state.selectedId) || state.dishes[0];
const saveSettings = () => save('settings', state.settings);
const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DISH_BG = { dal: '#FFE08A', rice: '#CFE8F7', rajma: '#F9C4BC', chole: '#FAD3A5', aloo: '#D6EBC0', khichdi: '#E2D6F3', custom: '#E7F6F2' };
const plural = (n) => (n === 1 ? 'whistle' : 'whistles');

function go(screen) {
  state.screen = screen;
  render();
  window.scrollTo({ top: 0 });
}

function render() {
  cancelAnimationFrame(meterRaf);
  const views = { home, settings, permission, listen, done, release, calibrate: calibrateView };
  app.innerHTML = views[state.screen]();
  bind[state.screen]?.();
}

/* ------------------------------------------------------------- building blocks */
// Green app bar, like WhatsApp.
function appBar({ title, sub = '', back = false, right = '' }) {
  return `<header class="sticky top-0 z-20 flex items-center gap-2 bg-green px-2 pb-2 text-white" style="padding-top:max(.5rem,env(safe-area-inset-top))">
    ${back ? `<button data-back class="flex h-12 min-w-12 items-center justify-center rounded-full px-2" aria-label="Go back">${I.back('h-7 w-7')}</button>` : '<span class="w-3"></span>'}
    <div class="min-w-0 flex-1"><h1 class="truncate text-[22px] font-bold leading-tight">${title}</h1>${sub ? `<p class="truncate text-[15px] text-white/90">${sub}</p>` : ''}</div>
    ${right}
  </header>`;
}

function card(inner, cls = '') {
  return `<section class="mx-3 mt-3 rounded-2xl bg-card p-4 shadow-sm ${cls}">${inner}</section>`;
}

function toggle(name, on, label) {
  return `<button data-toggle="${name}" role="switch" aria-checked="${on}" aria-label="${label}"
    class="relative h-9 w-16 shrink-0 rounded-full transition-colors ${on ? 'bg-green' : 'bg-[#8696A0]'}">
    <span class="absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${on ? 'left-8' : 'left-1'}"></span>
  </button>`;
}

// Big − value + control.
function stepper(attr, value, unit, less, more) {
  return `<div class="flex items-center gap-3">
    <button ${attr}="-1" class="btn-soft flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-4xl font-bold" aria-label="${less}">−</button>
    <div class="flex-1 text-center"><span class="text-5xl font-extrabold">${value}</span> <span class="text-lg font-semibold text-ink-2">${unit}</span></div>
    <button ${attr}="1" class="btn-green flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-4xl font-bold" aria-label="${more}">+</button>
  </div>`;
}

// Choice chips with a visible tick, like YouTube filter chips.
function chips(name, value, options, label) {
  return `<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="${label}">
    ${options.map(([v, l]) => `<button data-seg="${name}" data-val="${v}" role="radio" aria-checked="${value === v}"
      class="flex min-h-12 items-center gap-1.5 rounded-full border-2 px-4 text-[17px] font-semibold ${value === v ? 'border-green bg-green-soft text-green-dark' : 'border-line bg-card text-ink'}">
      ${value === v ? I.check('h-5 w-5') : ''}${l}</button>`).join('')}
  </div>`;
}

function progressBar(count, target) {
  const pct = Math.round((count / Math.max(target, 1)) * 100);
  return `<div class="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true"><div class="h-full rounded-full bg-red transition-[width] duration-500" style="width:${pct}%"></div></div>`;
}

// Whistle log as chat messages.
function chatLog(log) {
  if (!log.length) return `<div class="flex justify-center"><span class="rounded-lg bg-[#FFEECD] px-3 py-1.5 text-center text-[15px] text-ink-2">Each whistle will show up here as a message.</span></div>`;
  return log.map((e) => e.type === 'note'
    ? `<div class="flex justify-center"><span class="max-w-[90%] rounded-lg bg-[#FFEECD] px-3 py-1.5 text-center text-[15px] text-ink">${esc(e.text)}</span></div>`
    : `<div class="flex justify-end pr-2"><div class="bubble max-w-[85%] px-3 pb-1.5 pt-2">
        <p class="text-[18px] font-semibold">${ordinal(e.n)} seeti aayi ${e.source === 'manual' ? '<span class="font-normal text-ink-2">(added by you)</span>' : ''}</p>
        <p class="flex items-center justify-end gap-1 text-[13px] text-ink-2">${fmtTime(e.time)} <span class="text-tick">${I.ticks('h-4 w-4')}</span></p>
      </div></div>`).join('');
}

/* ------------------------------------------------------------------- HOME */
function home() {
  const d = selected();
  const st = state.settings;
  return `
  <main class="fade-in pb-36">
    <header class="flex items-center justify-between bg-card px-4 pb-3" style="padding-top:max(.75rem,env(safe-area-inset-top))">
      <div>
        <h1 class="text-[28px] font-extrabold text-green">Seeti</h1>
        <p class="text-[16px] text-ink-2">Cooker ki seeti, hum ginenge</p>
      </div>
      <button data-go-settings class="flex min-h-12 flex-col items-center justify-center rounded-xl px-3 text-ink-2" aria-label="Settings">
        ${I.gear('h-7 w-7')}<span class="text-[13px] font-semibold">Settings</span>
      </button>
    </header>

    ${card(`
      <div class="flex items-center gap-3">
        <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-soft text-green">${I.phone('h-7 w-7')}</span>
        <p class="text-[17px] leading-snug">Keep your phone in the kitchen. Seeti <b>counts the whistles</b> and <b>tells you</b> when to turn off the gas.</p>
      </div>`)}

    <h2 class="mx-4 mt-6 text-[20px] font-bold">1. What are you cooking?</h2>
    <section class="mx-3 mt-2 overflow-hidden rounded-2xl bg-card shadow-sm" role="radiogroup" aria-label="Dish">
      ${state.dishes.map((x, i) => `
        <button data-dish="${x.id}" role="radio" aria-checked="${x.id === d.id}"
          class="flex w-full items-center gap-4 px-4 py-3 text-left ${i ? 'border-t border-line' : ''} ${x.id === d.id ? 'bg-green-soft' : 'active:bg-page'}">
          <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-3xl" style="background:${DISH_BG[x.id]}">${x.emoji}</span>
          <span class="min-w-0 flex-1">
            <span class="block text-[20px] font-semibold leading-tight">${x.name}</span>
            <span class="block text-[16px] text-ink-2">${x.count} ${plural(x.count)}</span>
          </span>
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${x.id === d.id ? 'border-green bg-green text-white' : 'border-[#8696A0]'}">${x.id === d.id ? I.check('h-5 w-5') : ''}</span>
        </button>`).join('')}
    </section>

    <h2 class="mx-4 mt-6 text-[20px] font-bold">2. How many whistles?</h2>
    ${card(`
      ${stepper('data-step', d.count, plural(d.count), 'One less whistle', 'One more whistle')}
      <p class="mt-3 text-center text-[16px] text-ink-2">Saved for <b>${esc(d.name)}</b> for next time.</p>`, '!mt-2')}

    <div class="mx-4 mt-5 flex flex-wrap gap-x-4 gap-y-1 text-[16px] text-ink-2">
      <span class="flex items-center gap-1">${I.voice('h-5 w-5')} Voice: ${LANGS.find((l) => l.id === st.lang)?.label}</span>
      <span class="flex items-center gap-1">${I.clock('h-5 w-5')} ${st.releaseOn ? `Safe-to-open: ${st.releaseMin} min` : 'Safe-to-open: off'}</span>
    </div>

    <div class="fixed inset-x-0 bottom-0 z-10 bg-page/95 px-3 pt-3 backdrop-blur" style="padding-bottom:max(.75rem,env(safe-area-inset-bottom))">
      <div class="mx-auto max-w-md">
        <button data-start class="btn-green flex w-full items-center justify-center gap-3 rounded-full py-4 shadow-lg">
          ${I.play('h-8 w-8')}
          <span class="text-left"><span class="block text-[22px] font-bold leading-tight">Start</span>
          <span class="block text-[15px] text-white/90">${esc(d.name)} · ${d.count} ${plural(d.count)}</span></span>
        </button>
      </div>
    </div>
  </main>`;
}

bind.home = () => {
  $$('[data-dish]').forEach((b) => b.addEventListener('click', () => {
    state.selectedId = b.dataset.dish;
    save('lastDish', state.selectedId);
    const y = window.scrollY;
    render();
    window.scrollTo({ top: y });
  }));
  $$('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const d = selected();
    setDishCount(d.id, Math.max(MIN_COUNT, Math.min(MAX_COUNT, d.count + Number(b.dataset.step))));
    state.dishes = getDishes();
    const y = window.scrollY;
    render();
    window.scrollTo({ top: y });
  }));
  $('[data-go-settings]').addEventListener('click', () => go('settings'));
  $('[data-start]').addEventListener('click', () => { unlockAudio(); needMic(startSession); });
};

/* --------------------------------------------------------------- SETTINGS */
function settingRow(icon, title, sub, control = '', below = '') {
  return `<div class="border-t border-line px-4 py-4 first:border-0">
    <div class="flex items-center gap-4">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-soft text-green">${icon}</span>
      <div class="min-w-0 flex-1"><h2 class="text-[19px] font-semibold leading-tight">${title}</h2><p class="mt-0.5 text-[16px] leading-snug text-ink-2">${sub}</p></div>
      ${control}
    </div>
    ${below ? `<div class="mt-3 sm:pl-[60px]">${below}</div>` : ''}
  </div>`;
}

function settings() {
  const st = state.settings;
  return `
  <main class="fade-in pb-10">
    ${appBar({ title: 'Settings', back: true })}
    <section class="mx-3 mt-3 overflow-hidden rounded-2xl bg-card shadow-sm">
      ${settingRow(I.voice(), 'Voice language', 'Seeti says the count out loud.', '',
        chips('lang', st.lang, LANGS.map((l) => [l.id, l.label]), 'Voice language'))}
      ${settingRow(I.school(), "Learn my cooker's whistle",
        state.calib ? '<span class="font-semibold text-green-dark">✓ Done.</span> Seeti knows your cooker.' : 'Optional, 1 minute. Seeti listens to one whistle and counts better after that.',
        '', `<button data-go="calibrate" class="btn-soft min-h-12 rounded-full px-5 text-[17px] font-semibold">${state.calib ? 'Do it again' : 'Start'}</button>`)}
      ${settingRow(I.clock(), 'Safe-to-open timer',
        "After the gas is off, steam is still inside. Seeti waits and tells you when it's safe to open the lid.",
        toggle('releaseOn', st.releaseOn, 'Safe-to-open timer'),
        st.releaseOn ? stepper('data-rel', st.releaseMin, 'min', 'Less time', 'More time') : '')}
      ${settingRow(I.volume(), 'Where is your phone?', 'Helps Seeti hear the right sounds.', '',
        chips('sens', st.sens, [['low', 'Noisy kitchen'], ['normal', 'Near the cooker'], ['high', 'Far away']], 'Phone position'))}
      ${settingRow(I.spark(), 'Smart listening',
        'Uses a free AI helper to double-check each whistle. Needs about 15 MB of internet once.',
        toggle('ai', st.ai, 'Smart listening'))}
      ${settingRow(I.refresh(), 'Reset dish whistles', 'Go back to the usual numbers (Dal 3, Rice 2…).', '',
        `<div id="resetArea"><button data-reset class="btn-soft min-h-12 rounded-full px-5 text-[17px] font-semibold">Reset</button></div>`)}
    </section>
    <p class="mx-4 mt-4 flex items-center gap-2 text-[15px] text-ink-2">${I.lock('h-5 w-5 shrink-0')} Nothing is recorded or uploaded. Sound is checked on your phone only.</p>
  </main>`;
}

bind.settings = () => {
  $('[data-back]').addEventListener('click', () => go('home'));
  $$('[data-seg]').forEach((b) => b.addEventListener('click', () => {
    state.settings[b.dataset.seg] = b.dataset.val;
    saveSettings();
    render();
    if (b.dataset.seg === 'lang') { unlockAudio(); speak(VOICE[state.settings.lang].count(1), state.settings.lang); }
  }));
  $$('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
    state.settings[b.dataset.toggle] = !state.settings[b.dataset.toggle];
    saveSettings();
    render();
  }));
  $$('[data-rel]').forEach((b) => b.addEventListener('click', () => {
    state.settings.releaseMin = Math.max(1, Math.min(30, state.settings.releaseMin + Number(b.dataset.rel)));
    saveSettings();
    render();
  }));
  // Confirm inside the page (no pop-up dialogs).
  $('[data-reset]').addEventListener('click', () => {
    $('#resetArea').innerHTML = `<p class="text-[16px] font-semibold">Reset all dishes?</p>
      <div class="mt-2 flex gap-2"><button data-reset-yes class="btn-green min-h-12 rounded-full px-5 font-semibold">Yes, reset</button>
      <button data-reset-no class="btn-soft min-h-12 rounded-full px-5 font-semibold">No</button></div>`;
    $('[data-reset-yes]').addEventListener('click', () => { resetDishes(); state.dishes = getDishes(); render(); });
    $('[data-reset-no]').addEventListener('click', () => render());
  });
  $('[data-go="calibrate"]').addEventListener('click', () => needMic(() => go('calibrate')));
};

/* ------------------------------------------------------------- PERMISSION */
let afterPermission = null;

async function needMic(next) {
  if (PREVIEW) return next();
  let granted = load('micOk', false);
  try {
    const p = await navigator.permissions?.query({ name: 'microphone' });
    if (p) granted = p.state === 'granted';
  } catch { /* Safari/Firefox may not support this query */ }
  if (granted) return next();
  afterPermission = next;
  go('permission');
}

function permission() {
  const row = (icon, title, text) => `<li class="flex gap-4"><span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-soft text-green">${icon}</span>
    <div><p class="text-[19px] font-semibold">${title}</p><p class="text-[17px] text-ink-2">${text}</p></div></li>`;
  return `
  <main class="fade-in flex min-h-dvh flex-col bg-card">
    ${appBar({ title: 'Allow microphone', back: true })}
    <div class="flex flex-1 flex-col px-5 pt-6">
      <span class="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-green text-white">${I.mic('h-12 w-12')}</span>
      <h2 class="mt-5 text-center text-[26px] font-bold leading-tight">Seeti needs to hear your cooker</h2>
      <ul class="mt-6 space-y-5">
        ${row(I.bell(), 'Why?', 'To hear each whistle and count it for you.')}
        ${row(I.lock(), 'Private', 'Nothing is recorded, saved or sent anywhere.')}
        ${row(I.phone(), 'Keep Seeti open', 'Leave the app open on the screen while cooking.')}
      </ul>
      <p id="permErr" class="mt-5 hidden rounded-xl bg-[#FDECEA] p-4 text-[17px] text-[#B3121C]"></p>
      <div class="mt-auto py-5" style="padding-bottom:max(1.25rem,env(safe-area-inset-bottom))">
        <button data-allow class="btn-green w-full rounded-full py-4 text-[20px] font-bold">Allow microphone</button>
        <p class="mt-3 text-center text-[15px] text-ink-2">Your phone will ask. Tap <b>Allow</b>.</p>
      </div>
    </div>
  </main>`;
}

bind.permission = () => {
  $('[data-back]').addEventListener('click', () => go('home'));
  $('[data-allow]').addEventListener('click', async () => {
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
  if (e?.name === 'NotAllowedError') return 'The mic is blocked. Open your phone Settings → Chrome (or Safari) → Microphone → Allow. Then try again.';
  if (e?.name === 'NotFoundError') return 'No microphone was found on this phone.';
  if (e?.name === 'NotReadableError') return 'Another app is using the mic (a call or voice note). Close it and try again.';
  return 'Could not start the mic. Please try again.';
}

/* --------------------------------------------------------------- SESSION */
async function startSession() {
  const d = selected();
  state.session = { dish: d, target: d.count, count: 0, log: [], startedAt: new Date(), phase: 'learning', error: null };
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
}

function countWhistle(source = 'sound', at = new Date()) {
  const s = state.session;
  if (!s || s.count >= s.target) return;
  s.count += 1;
  s.log.push({ n: s.count, time: at, source });
  vibrate(source === 'manual' ? 60 : [180, 80, 180]);
  puff($('#liveCooker'));
  updateCount();
  renderLog();
  const lang = state.settings.lang;
  if (s.count >= s.target) { reachTarget(); return; }
  chime();
  const left = s.target - s.count;
  setTimeout(() => speak(VOICE[lang].count(s.count) + (left === 1 ? '. ' + VOICE[lang].oneLeft : ''), lang), 350);
}

function undoWhistle() {
  const s = state.session;
  if (!s || s.count === 0) return;
  for (let i = s.log.length - 1; i >= 0; i--) {
    if (s.log[i].n === s.count) { s.log.splice(i, 1); break; }
  }
  s.count -= 1;
  vibrate(40);
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
function listen() {
  const s = state.session;
  if (s.error) {
    return `
    <main class="fade-in flex min-h-dvh flex-col bg-card">
      ${appBar({ title: esc(s.dish.name), back: true })}
      <div class="flex flex-1 flex-col px-5 pt-6">
        <span class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#FDECEA] text-[#B3121C]">${I.mic('h-10 w-10')}</span>
        <h2 class="mt-4 text-center text-[24px] font-bold">The mic did not start</h2>
        <p class="mt-3 text-center text-[18px]">${esc(s.error)}</p>
        <div class="mt-auto grid gap-3 py-5">
          <button data-manual class="btn-green rounded-full py-4 text-[20px] font-bold">Count by hand</button>
          <button data-retry class="btn-soft rounded-full py-4 text-[19px] font-semibold">Try the mic again</button>
        </div>
      </div>
    </main>`;
  }
  return `
  <main class="fade-in flex min-h-dvh flex-col bg-chat">
    <header class="sticky top-0 z-20 flex items-center gap-3 bg-green px-2 pb-2 text-white" style="padding-top:max(.5rem,env(safe-area-inset-top))">
      <button data-stop class="flex h-12 w-10 items-center justify-center rounded-full" aria-label="Stop and go back">${I.back('h-7 w-7')}</button>
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl" style="background:${DISH_BG[s.dish.id]}">${s.dish.emoji}</span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-[20px] font-bold leading-tight">${esc(s.dish.name)}</p>
        <p id="barSub" class="truncate text-[15px] text-white/90">starting…</p>
      </div>
      <button data-stop-btn class="flex min-h-11 items-center gap-1.5 rounded-full bg-white/15 px-4 text-[16px] font-semibold">${I.stop('h-4 w-4')} Stop</button>
    </header>

    <div id="stopConfirm" class="hidden bg-[#FFEECD] px-4 py-3">
      <p class="text-[17px] font-semibold">Stop counting? The count will be lost.</p>
      <div class="mt-2 flex gap-2"><button data-stop-yes class="btn-green min-h-12 rounded-full px-5 font-semibold">Yes, stop</button>
      <button data-stop-no class="btn-soft min-h-12 rounded-full px-5 font-semibold">Keep counting</button></div>
    </div>

    <section class="mx-3 mt-3 overflow-hidden rounded-2xl bg-card shadow-sm">
      <div id="cookerWrap" class="overflow-hidden bg-[#FFD98E]">${cookerSVG({ count: s.count, target: s.target, scene: true, id: 'liveCooker' })}</div>
      <div class="px-4 pb-4 pt-3">
        <div class="flex items-center justify-between gap-2">
          <p id="status" class="text-[20px] font-bold" aria-live="polite"></p>
          <span class="flex shrink-0 items-center gap-1.5 text-[14px] font-bold text-red"><span class="live-dot"></span>LIVE</span>
        </div>
        <div class="mt-2" id="progress">${progressBar(s.count, s.target)}</div>
        <p id="countText" class="mt-1.5 text-[16px] text-ink-2"><b class="text-ink">${s.count} of ${s.target}</b> whistles</p>
        <div class="mt-3 flex items-center gap-3" aria-hidden="true">
          <span class="text-ink-2">${I.volume('h-6 w-6')}</span>
          <div class="relative h-3 flex-1 overflow-hidden rounded-full bg-line">
            <div id="meterLevel" class="h-full w-0 rounded-full bg-[#8696A0] transition-[width] duration-75"></div>
            <div id="meterThr" class="absolute top-0 h-full w-1 rounded bg-green" style="left:0"></div>
          </div>
        </div>
        <p id="meterNote" class="mt-1 text-[15px] text-ink-2">Listening to the kitchen…</p>
      </div>
    </section>

    <section id="log" class="flex flex-1 flex-col gap-2 px-3 py-4">${chatLog(s.log)}</section>

    <div class="sticky bottom-0 z-10 flex gap-3 bg-chat px-3 pt-2" style="padding-bottom:max(.75rem,env(safe-area-inset-bottom))">
      <button data-minus class="flex min-h-16 flex-col items-center justify-center rounded-full bg-card px-5 shadow-sm" aria-label="Remove one whistle">
        <span class="text-[22px] font-bold leading-none">−1</span><span class="text-[13px] text-ink-2">mistake</span>
      </button>
      <button data-plus class="btn-green flex min-h-16 flex-1 items-center justify-center rounded-full text-[22px] font-bold shadow-md" aria-label="Add one whistle">+1 Seeti</button>
    </div>
  </main>`;
}

bind.listen = () => {
  const s = state.session;
  if (s.error) {
    $('[data-back]').addEventListener('click', () => { stopListening(); go('home'); });
    $('[data-retry]').addEventListener('click', () => startSession());
    $('[data-manual]').addEventListener('click', () => { s.error = null; s.phase = 'manual'; render(); keepAwake(true); });
    return;
  }
  const stop = () => { stopListening(); keepAwake(false); go('home'); };
  const askStop = () => (s.count === 0 ? stop() : $('#stopConfirm').classList.remove('hidden'));
  $('[data-stop]').addEventListener('click', askStop);
  $('[data-stop-btn]').addEventListener('click', askStop);
  $('[data-stop-yes]').addEventListener('click', stop);
  $('[data-stop-no]').addEventListener('click', () => $('#stopConfirm').classList.add('hidden'));
  $('[data-plus]').addEventListener('click', () => { detector?.pauseFor(6); countWhistle('manual'); });
  $('[data-minus]').addEventListener('click', undoWhistle);
  updateStatus();
  updateWakeNote();
  meterLoop();
};

const STATUS = {
  learning: 'Getting to know your kitchen…',
  listening: 'Listening for the whistle…',
  hearing: 'I hear something…',
  cooldown: 'Got it ✓',
  manual: 'Tap +1 Seeti for each whistle',
};
const SUB = {
  learning: 'getting ready…',
  listening: 'listening…',
  hearing: 'hearing a sound…',
  cooldown: 'whistle counted ✓',
  manual: 'counting by hand',
};

function updateStatus() {
  const s = state.session;
  const el = $('#status');
  if (!el || !s) return;
  let text = STATUS[s.phase] || STATUS.listening;
  if (s.phase === 'listening' && s.target - s.count === 1) text = 'Bas ek aur. Just one more.';
  el.textContent = text;
  const sub = $('#barSub');
  if (sub) sub.textContent = (SUB[s.phase] || SUB.listening) + (state.aiStatus === 'on' ? ' · smart listening on' : '');
  $('#liveCooker')?.classList.toggle('hearing', s.phase === 'hearing');
}

function updateCount() {
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
  if (ct) ct.innerHTML = `<b class="text-ink">${s.count} of ${s.target}</b> whistles`;
  const pg = $('#progress');
  if (pg) pg.innerHTML = progressBar(s.count, s.target);
  updateStatus();
}

function renderLog() {
  const el = $('#log');
  if (el && state.session) {
    el.innerHTML = chatLog(state.session.log);
    el.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function updateWakeNote() {
  const s = state.session;
  if (state.screen !== 'listen' || !s || isAwake() || s.wakeNoted) return;
  s.wakeNoted = true;
  addNote('Tip: this phone may lock the screen. Keep Seeti open and turn off auto-lock while cooking.');
}

// Map dB (-90..-10) to 0..100%
const dbToPct = (db) => Math.max(0, Math.min(100, ((db + 90) / 80) * 100));

function meterLoop() {
  const level = $('#meterLevel');
  if (!level) return;
  const L = detector?.live;
  if (L) {
    level.style.width = dbToPct(L.levelDb) + '%';
    level.style.background = L.hot ? 'var(--green)' : '';
    $('#meterThr').style.left = dbToPct(L.threshold) + '%';
    const note = $('#meterNote');
    if (note) {
      note.textContent = L.phase === 'learning' ? `Getting ready… ${Math.round(L.learnProgress * 100)}%`
        : L.phase === 'cooldown' ? `Whistle counted. Listening again in ${Math.ceil(L.cooldownLeft)} sec.`
        : L.hot ? 'Sounds like a whistle. Keep going…'
        : L.levelDb > L.baseline + 4 ? 'Some sound, not a whistle.'
        : 'Quiet kitchen.';
    }
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
    <h1 class="mt-6 text-[48px] font-extrabold leading-tight">${esc(title[lang] || title.en)}</h1>
    ${lang !== 'en' ? `<p class="mt-2 text-[24px] font-bold">${esc(sub)}</p>` : ''}
    <p class="mt-4 text-[19px]">${esc(state.session?.dish.name || '')} · ${state.session?.count ?? ''} ${plural(state.session?.count ?? 0)}</p>
    <button class="mt-10 min-h-16 rounded-full bg-white px-10 text-[22px] font-bold text-[#B3121C]">OK, done ✓</button>
    <p class="mt-3 text-[16px] text-white/90">Tap anywhere to stop the sound</p>`;
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
  overlay.addEventListener('keydown', (e) => {
    if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); stop(); }
  });
}

/* --------------------------------------------------------------- RELEASE */
function startRelease() {
  state.session.releaseEnd = Date.now() + state.settings.releaseMin * 60_000;
  keepAwake(true);
  go('release');
}

function release() {
  return `
  <main class="fade-in flex min-h-dvh flex-col bg-card">
    ${appBar({ title: 'Safe-to-open timer', sub: 'Steam is still inside' })}
    <div class="flex flex-1 flex-col items-center px-5 pt-6 text-center">
      <h2 class="text-[24px] font-bold">Don't open the cooker yet</h2>
      <p class="mt-1 text-[18px] text-ink-2">Seeti will tell you when it's safe.</p>
      <div class="relative mt-6 aspect-square w-64 max-w-full">
        <svg viewBox="0 0 100 100" class="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--line)" stroke-width="7"/>
          <circle id="ring" cx="50" cy="50" r="44" fill="none" stroke="var(--green)" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/>
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span id="clock" class="text-[56px] font-extrabold tabular-nums">--:--</span>
          <span class="text-[17px] text-ink-2">minutes left</span>
        </div>
      </div>
      <div class="mt-6 grid w-full grid-cols-2 gap-3">
        <button data-addmin class="btn-soft min-h-14 rounded-full text-[19px] font-semibold">+1 minute</button>
        <button data-skip class="btn-soft min-h-14 rounded-full text-[19px] font-semibold">Skip</button>
      </div>
      <p class="mt-6 rounded-xl bg-[#FFEECD] p-3 text-[16px]">Keep Seeti open so the timer can ring. Always check the cooker yourself before opening.</p>
    </div>
  </main>`;
}

bind.release = () => {
  const s = state.session;
  const total = () => state.settings.releaseMin * 60_000 + (s.extraMs || 0);
  const tick = () => {
    const left = Math.max(0, s.releaseEnd - Date.now());
    const clock = $('#clock');
    if (!clock) return;
    clock.textContent = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
    $('#ring').setAttribute('stroke-dashoffset', String(100 - (left / total()) * 100));
    if (left <= 0) {
      clearInterval(releaseTimer);
      document.removeEventListener('visibilitychange', tick);
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
  releaseTimer = setInterval(tick, 250);
  document.addEventListener('visibilitychange', tick);
  tick();
  $('[data-addmin]').addEventListener('click', () => { s.releaseEnd += 60_000; s.extraMs = (s.extraMs || 0) + 60_000; tick(); });
  $('[data-skip]').addEventListener('click', () => { clearInterval(releaseTimer); document.removeEventListener('visibilitychange', tick); keepAwake(false); go('done'); });
};

/* ------------------------------------------------------------------ DONE */
function done() {
  const s = state.session;
  const mins = s.endedAt ? Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000)) : null;
  return `
  <main class="fade-in flex min-h-dvh flex-col bg-chat">
    ${appBar({ title: 'Ho gaya!', sub: 'Khana tayyar hai' })}
    <section class="mx-3 mt-3 rounded-2xl bg-card p-5 text-center shadow-sm">
      <span class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green text-white">${I.check('h-12 w-12')}</span>
      <h2 class="mt-3 text-[26px] font-bold">${esc(s.dish.name)} is ready</h2>
      <p class="text-[18px] text-ink-2">${s.count} ${plural(s.count)}${mins ? ` · ${mins} min` : ''}</p>
    </section>
    <section class="flex flex-1 flex-col gap-2 px-3 py-4">${chatLog(s.log)}</section>
    <div class="px-3 pt-2" style="padding-bottom:max(.75rem,env(safe-area-inset-bottom))">
      <button data-again class="btn-green w-full rounded-full py-4 text-[20px] font-bold">Cook something else</button>
    </div>
  </main>`;
}

bind.done = () => {
  $('[data-again]').addEventListener('click', () => { state.session = null; go('home'); });
};

/* ------------------------------------------------------------ CALIBRATE */
const cal = { step: 'intro', result: null, error: null };

function calibrateView() {
  const r = cal.result;
  const steps = [
    'Put your phone where it will be while cooking.',
    'Tap Start and stay quiet for 3 seconds.',
    'Wait for one whistle. Seeti learns its sound.',
  ];
  const body = {
    intro: `
      <ol class="mt-4 space-y-4">
        ${steps.map((t, i) => `<li class="flex items-start gap-4"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green text-[19px] font-bold text-white">${i + 1}</span><p class="pt-1 text-[19px]">${t}</p></li>`).join('')}
      </ol>
      <div class="mt-auto grid gap-3 py-5">
        <button data-cal-start class="btn-green rounded-full py-4 text-[20px] font-bold">Start</button>
        ${state.calib ? '<button data-cal-clear class="btn-soft rounded-full py-3.5 text-[18px] font-semibold">Forget my cooker</button>' : ''}
      </div>`,
    run: `
      <p id="calStatus" class="mt-4 text-center text-[24px] font-bold">Stay quiet for 3 seconds…</p>
      <div class="mx-auto mt-2 w-56"><div class="overflow-hidden rounded-2xl bg-[#FFD98E]">${cookerSVG({ flame: true, id: 'calSvg' })}</div></div>
      <div class="mt-5 h-3 overflow-hidden rounded-full bg-line"><div id="calLevel" class="h-full w-0 rounded-full bg-green transition-[width] duration-75"></div></div>
      <p id="calNote" class="mt-2 text-center text-[17px] text-ink-2"></p>
      <div class="mt-auto grid gap-3 py-5">
        <button data-cal-now disabled class="btn-green rounded-full py-4 text-[20px] font-bold disabled:opacity-40">That was the whistle</button>
        <button data-cal-cancel class="btn-soft rounded-full py-3.5 text-[18px] font-semibold">Cancel</button>
      </div>`,
    result: r ? `
      <span class="mx-auto mt-6 flex h-20 w-20 items-center justify-center rounded-full bg-green text-white">${I.check('h-12 w-12')}</span>
      <h2 class="mt-4 text-center text-[26px] font-bold">Got it</h2>
      <p class="mt-2 text-center text-[19px]">Seeti learned how your cooker sounds.</p>
      ${r.snrDb < 8
        ? '<p class="mt-4 rounded-xl bg-[#FFEECD] p-3 text-[17px]">The whistle was quite soft. For best results, keep the phone a little closer to the cooker.</p>'
        : '<p class="mt-4 rounded-xl bg-green-soft p-3 text-[17px] text-green-dark">The whistle was loud and clear ✓</p>'}
      <div class="mt-auto grid gap-3 py-5">
        <button data-cal-save class="btn-green rounded-full py-4 text-[20px] font-bold">Save</button>
        <button data-cal-start class="btn-soft rounded-full py-3.5 text-[18px] font-semibold">Try again</button>
      </div>` : '',
    fail: `
      <h2 class="mt-8 text-center text-[24px] font-bold">Seeti didn't hear a whistle</h2>
      <p class="mt-2 text-center text-[18px]">${esc(cal.error || '')}</p>
      <div class="mt-auto grid gap-3 py-5">
        <button data-cal-start class="btn-green rounded-full py-4 text-[20px] font-bold">Try again</button>
        <button data-cal-cancel class="btn-soft rounded-full py-3.5 text-[18px] font-semibold">Back</button>
      </div>`,
  }[cal.step];

  return `
  <main class="fade-in flex min-h-dvh flex-col bg-card">
    ${appBar({ title: "Learn my cooker's whistle", sub: 'Takes about 1 minute', back: true })}
    <div class="flex flex-1 flex-col px-5 pt-4" style="padding-bottom:env(safe-area-inset-bottom)">${body}</div>
  </main>`;
}

function endCalMic() {
  calibRun?.cancel();
  calibRun = null;
  mic?.close();
  mic = null;
}

bind.calibrate = () => {
  const back = () => { endCalMic(); cal.step = 'intro'; cal.result = null; keepAwake(false); go('settings'); };
  $('[data-back]')?.addEventListener('click', back);
  $$('[data-cal-cancel]').forEach((b) => b.addEventListener('click', back));
  $('[data-cal-clear]')?.addEventListener('click', () => { remove('calib'); state.calib = null; go('settings'); });
  $('[data-cal-save]')?.addEventListener('click', () => {
    state.calib = cal.result;
    save('calib', cal.result);
    cal.step = 'intro';
    cal.result = null;
    endCalMic();
    keepAwake(false);
    go('settings');
  });
  $$('[data-cal-start]').forEach((b) => b.addEventListener('click', async () => {
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
        st.textContent = u.phase === 'learning' ? 'Stay quiet for 3 seconds…'
          : u.phase === 'hearing' ? 'I hear it. Keep going…' : 'Ready. Waiting for a whistle…';
        $('#calSvg')?.classList.toggle('hearing', u.phase === 'hearing');
        const now = $('[data-cal-now]');
        if (now) now.disabled = (u.heardSec || 0) < 0.5;
        $('#calLevel').style.width = dbToPct(u.levelDb) + '%';
        $('#calNote').textContent = u.phase === 'learning'
          ? `${Math.round(u.progress * 100)}% ready`
          : (u.heardSec || 0) > 0 ? `Heard ${(u.heardSec || 0).toFixed(1)} seconds of whistle` : 'The bar moves when there is sound.';
      },
      onDone: (res) => {
        calibRun = null;
        mic?.close();
        mic = null;
        cal.result = res;
        cal.step = 'result';
        vibrate(120);
        chime();
        render();
      },
      onFail: (why) => {
        calibRun = null;
        mic?.close();
        mic = null;
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
    if (mic.stream.getAudioTracks().some((t) => t.readyState === 'ended')) {
      addNote('The phone turned the mic off. Tap Stop and start again.');
    }
    if ((Date.now() - hiddenAt) / 1000 > 5) addNote(`Seeti was closed from ${fmtTime(hiddenAt)} to ${fmtTime(new Date())}. Please check the count.`);
    hiddenAt = null;
  }
});

window.addEventListener('beforeunload', (e) => {
  const s = state.session;
  if (state.screen === 'listen' && s && !s.error && s.count < s.target) {
    e.preventDefault();
    e.returnValue = '';
  }
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
