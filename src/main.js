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
import { cookerSVG, puff, ICONS } from './cooker.js';

/* ------------------------------------------------------------------ state */
const app = document.getElementById('app');

const state = {
  screen: 'home',
  dishes: getDishes(),
  selectedId: load('lastDish', 'dal'),
  settings: {
    lang: 'hi',
    releaseOn: true,
    releaseMin: 10,
    sens: 'normal',
    ai: true,
    ...load('settings', {}),
  },
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

function go(screen) {
  state.screen = screen;
  render();
  window.scrollTo({ top: 0 });
}

/* ---------------------------------------------------------------- render */
function render() {
  cancelAnimationFrame(meterRaf);
  const views = { home, settings, permission, listen, done, release, calibrate: calibrateView };
  app.innerHTML = views[state.screen]();
  bind[state.screen]?.();
}

/* ----------------------------------------------------------------- pieces */
const DISH_BG = { dal: '#FFE08A', rice: '#CFE8F7', rajma: '#F9C4BC', chole: '#FAD3A5', aloo: '#D6EBC0', khichdi: '#E2D6F3', custom: '#F3EDE5' };

// Segmented pill control (like an "Audio | Text" switch).
function segmented(name, value, options, label) {
  return `<div class="flex rounded-full bg-mist p-1" role="radiogroup" aria-label="${label}">
    ${options.map(([v, l]) => `<button data-seg="${name}" data-val="${v}" role="radio" aria-checked="${value === v}"
      class="flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${value === v ? 'bg-brown text-cream shadow-sm' : 'text-muted'}">${l}</button>`).join('')}
  </div>`;
}

function toggle(name, on, label) {
  return `<button data-toggle="${name}" role="switch" aria-checked="${on}" aria-label="${label}"
    class="relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? 'bg-leaf' : 'bg-sand'}">
    <span class="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-7' : 'left-1'}"></span>
  </button>`;
}

// Grey square − / value / + control.
function stepper(attr, value, unit, labelLess, labelMore) {
  return `<div class="flex items-center gap-3">
    <button ${attr}="-1" class="btn-line h-12 w-12 rounded-xl text-2xl font-semibold" aria-label="${labelLess}">−</button>
    <div class="flex h-12 min-w-16 flex-1 items-center justify-center rounded-xl bg-mist px-3 text-xl font-extrabold">${value}<span class="ml-1 text-sm font-semibold text-muted">${unit}</span></div>
    <button ${attr}="1" class="btn-line h-12 w-12 rounded-xl text-2xl font-semibold" aria-label="${labelMore}">+</button>
  </div>`;
}

function gauge(count, target) {
  const pct = Math.round((count / Math.max(target, 1)) * 100);
  return `<div class="bar" aria-hidden="true"><div style="width:${pct}%"></div></div>`;
}

function logList(log, dark = false) {
  const sub = dark ? 'text-sand/80' : 'text-muted';
  if (!log.length) return `<p class="py-2 text-sm ${sub}">No whistles yet.</p>`;
  return `<ol class="divide-y ${dark ? 'divide-brown-2' : 'divide-line'}">
    ${log.map((e) => e.type === 'note'
      ? `<li class="py-2 text-sm ${sub}">${esc(e.text)}</li>`
      : `<li class="flex items-center justify-between py-2.5">
          <span class="font-bold">${ordinal(e.n)} seeti</span>
          <span class="text-sm ${sub}">${fmtTime(e.time)} · ${e.source === 'manual' ? 'manual' : e.source === 'ai' ? 'AI' : 'heard'}</span>
        </li>`).join('')}
  </ol>`;
}

/* ------------------------------------------------------------------- HOME */
function home() {
  const d = selected();
  const st = state.settings;
  const langLabel = LANGS.find((l) => l.id === st.lang)?.label;
  const chip = (text) => `<button data-go-settings class="rounded-full bg-mist px-4 py-2 text-sm font-semibold text-ink-2">${text}</button>`;
  return `
  <main class="fade-in relative overflow-hidden px-5 pb-36 pt-[max(1.5rem,env(safe-area-inset-top))]">
    <div class="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-leaf" aria-hidden="true"></div>
    <header class="relative flex items-start justify-between">
      <div>
        <h1 class="text-[44px] font-extrabold leading-none tracking-tight">Seeti</h1>
        <p class="mt-2 font-semibold text-muted">Cooker ki seeti, hum ginenge.</p>
      </div>
      <button data-go-settings class="mt-1 flex h-14 w-14 items-center justify-center rounded-full bg-white text-ink shadow-md" aria-label="Settings">${ICONS.gear}</button>
    </header>

    <section class="mt-8">
      <h2 class="text-lg font-extrabold">What are you cooking?</h2>
      <div class="no-scrollbar -mx-5 mt-2 flex snap-x scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 pt-2" role="radiogroup" aria-label="Dish">
        ${state.dishes.map((x) => `
          <button class="dish w-32 shrink-0 snap-start text-left" data-dish="${x.id}" role="radio" aria-pressed="${x.id === d.id}" aria-checked="${x.id === d.id}">
            <span class="dish-art relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl" style="background:${DISH_BG[x.id]}">
              <span class="absolute -bottom-6 -right-6 h-20 w-20 rounded-full bg-white/35"></span>
              <span class="relative text-6xl leading-none">${x.emoji}</span>
            </span>
            <span class="mt-2 block font-bold leading-tight">${x.name}</span>
            <span class="block text-xs font-semibold text-muted">${x.count} whistles${x.edited ? ' · edited' : ''}</span>
          </button>`).join('')}
      </div>
    </section>

    <section class="mt-6 rounded-3xl bg-white p-5 shadow-sm">
      <div class="flex items-baseline justify-between">
        <h2 class="text-lg font-extrabold">How many whistles?</h2>
        <span class="label">for ${esc(d.name)}</span>
      </div>
      <div class="mt-4">${stepper('data-step', d.count, '', 'One less whistle', 'One more whistle')}</div>
      <p class="mt-3 text-sm text-muted">Seeti remembers this for next time.</p>
    </section>

    <div class="mt-5 flex flex-wrap gap-2">
      ${chip(`Voice · ${langLabel}`)}
      ${chip(st.releaseOn ? `Safe-to-open · ${st.releaseMin} min` : 'Safe-to-open · off')}
      ${chip(state.calib ? 'Cooker learned ✓' : 'Learn my cooker')}
    </div>

    <div class="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-cream via-cream to-cream/0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
      <div class="mx-auto max-w-md">
        <button data-start class="btn-primary flex w-full items-center gap-4 rounded-full p-2 pr-6 shadow-lg">
          <span class="flex h-14 w-14 items-center justify-center rounded-full bg-cream text-brown">${ICONS.ear}</span>
          <span class="flex-1 text-left"><span class="block text-lg font-extrabold leading-tight">Start listening</span>
          <span class="block text-sm font-semibold text-sand">${esc(d.name)} · ${d.count} whistles</span></span>
          <span class="text-2xl" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  </main>`;
}

/* --------------------------------------------------------------- SETTINGS */
function settingCard(title, what, control, below = '') {
  return `<section class="rounded-3xl bg-white p-5 shadow-sm">
    <div class="flex items-start justify-between gap-4">
      <div><h2 class="text-lg font-extrabold leading-tight">${title}</h2><p class="mt-1 text-sm leading-relaxed text-muted">${what}</p></div>
      ${control}
    </div>${below}
  </section>`;
}

function settings() {
  const st = state.settings;
  return `
  <main class="fade-in px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
    <header class="flex items-center gap-3">
      <button data-home class="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm" aria-label="Back">${ICONS.back}</button>
      <h1 class="text-2xl font-extrabold">Settings</h1>
    </header>
    <div class="mt-6 space-y-4">
      ${settingCard('Voice language', 'Seeti says the count out loud: “Ek seeti!”, “Two whistles!”…', '',
        `<div class="mt-4">${segmented('lang', st.lang, LANGS.map((l) => [l.id, l.label]), 'Voice language')}</div>`)}

      ${settingCard("Learn my cooker's whistle",
        'Optional, 1 minute. Seeti listens to one real whistle from your cooker and remembers its sound — so it counts more accurately.',
        '',
        `<div class="mt-4 flex items-center justify-between gap-3">
          <span class="text-sm font-semibold ${state.calib ? 'text-leaf' : 'text-muted'}">${state.calib ? `✓ Learned (${(state.calib.peakHz / 1000).toFixed(1)} kHz)` : 'Not done yet'}</span>
          <button data-go="calibrate" class="btn-primary rounded-full px-5 py-2.5 text-sm font-bold">${state.calib ? 'Redo' : 'Start'}</button>
        </div>`)}

      ${settingCard('Safe-to-open timer',
        "After the gas is off, steam is still inside. Opening early is dangerous — Seeti counts down and tells you when it's safe to open the lid.",
        toggle('releaseOn', st.releaseOn, 'Safe-to-open timer'),
        `<div class="mt-4 ${st.releaseOn ? '' : 'pointer-events-none opacity-40'}">${stepper('data-rel', st.releaseMin, 'min', 'Less time', 'More time')}</div>`)}

      ${settingCard('Sensitivity', 'Low for a noisy kitchen. High if the phone is far from the cooker.', '',
        `<div class="mt-4">${segmented('sens', st.sens, [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']], 'Sensitivity')}</div>`)}

      ${settingCard('AI listening', 'A free sound-recognition model double-checks each whistle. Downloads ~15 MB once and runs on your phone.',
        toggle('ai', st.ai, 'AI listening'))}

      <button data-reset class="w-full py-3 text-sm font-semibold text-muted underline">Reset dish counts to default</button>
    </div>
  </main>`;
}

bind.settings = () => {
  $('[data-home]').addEventListener('click', () => go('home'));
  $$('[data-seg]').forEach((b) => b.addEventListener('click', () => {
    state.settings[b.dataset.seg] = b.dataset.val;
    saveSettings();
    render();
    if (b.dataset.seg === 'lang') { unlockAudio(); speak(VOICE[state.settings.lang].count(1), state.settings.lang); }
  }));
  $$('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.toggle;
    state.settings[k] = !state.settings[k];
    saveSettings();
    render();
  }));
  $$('[data-rel]').forEach((b) => b.addEventListener('click', () => {
    state.settings.releaseMin = Math.max(1, Math.min(30, state.settings.releaseMin + Number(b.dataset.rel)));
    saveSettings();
    render();
  }));
  $('[data-reset]').addEventListener('click', () => {
    if (!confirm('Reset all dish whistle counts to the defaults?')) return;
    resetDishes();
    state.dishes = getDishes();
    render();
  });
  $('[data-go="calibrate"]').addEventListener('click', () => needMic(() => go('calibrate')));
};

bind.home = () => {
  $$('[data-dish]').forEach((b) => b.addEventListener('click', () => {
    state.selectedId = b.dataset.dish;
    save('lastDish', state.selectedId);
    const y = $('[role="radiogroup"]').scrollLeft;
    render();
    $('[role="radiogroup"]').scrollLeft = y;
  }));
  $$('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const d = selected();
    const n = Math.max(MIN_COUNT, Math.min(MAX_COUNT, d.count + Number(b.dataset.step)));
    setDishCount(d.id, n);
    state.dishes = getDishes();
    const y = $('[role="radiogroup"]').scrollLeft;
    render();
    $('[role="radiogroup"]').scrollLeft = y;
  }));
  $$('[data-go-settings]').forEach((b) => b.addEventListener('click', () => go('settings')));
  $('[data-start]').addEventListener('click', () => {
    unlockAudio();
    needMic(startSession);
  });
};

/* ------------------------------------------------------------- PERMISSION */
let afterPermission = null;

async function needMic(next) {
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
  return `
  <main class="fade-in flex min-h-dvh flex-col px-6 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
    <button data-back class="self-start font-mono text-sm text-muted">← Back</button>
    <div class="mx-auto mt-6 w-40">${cookerSVG({ flame: false })}</div>
    <h1 class="mt-4 text-4xl font-extrabold leading-tight">Seeti needs your ears… I mean, your mic.</h1>
    <ul class="mt-6 space-y-3 text-lg">
      <li class="flex gap-3"><span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mist text-sm font-bold">01</span><span><b class="font-bold">Why?</b> To hear the cooker whistle and count it for you.</span></li>
      <li class="flex gap-3"><span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mist text-sm font-bold">02</span><span><b class="font-bold">Private.</b> Nothing is recorded, saved or uploaded. Sound is checked live, on your phone, then thrown away.</span></li>
      <li class="flex gap-3"><span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mist text-sm font-bold">03</span><span><b class="font-bold">Tip:</b> Keep Seeti open and the phone near the kitchen. Phones pause the mic when the screen locks — Seeti will try to keep it on.</span></li>
    </ul>
    <p id="permErr" class="mt-4 hidden rounded-lg bg-mirch/10 p-3 text-mirch"></p>
    <div class="mt-auto pt-8">
      <button data-allow class="btn-primary w-full rounded-full py-4 text-2xl font-extrabold">Allow microphone</button>
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
  if (!window.isSecureContext) return 'The mic only works on a secure (https://) link. Open Seeti from its https address.';
  if (e?.name === 'NotAllowedError') return 'Mic is blocked. Tap the 🔒 icon in the address bar (or phone Settings → Browser → Microphone) and allow it, then try again.';
  if (e?.name === 'NotFoundError') return 'No microphone found on this device.';
  if (e?.name === 'NotReadableError') return 'Another app or tab may be using the mic (a call, voice note, recorder). Close it, then try again.';
  return `Could not open the mic: ${e?.message || e}`;
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
    if (state.screen === 'listen') {
      addNote('⚠️ Mic stopped by the phone. Tap Stop and start again.');
    }
  });
  detector = new WhistleDetector(mic, buildParams(state.calib, state.settings.sens), {
    onWhistle: ({ source, at }) => countWhistle(source, at),
    onPhase: (p) => { state.session.phase = p; updateStatus(); },
  });
  detector.start();
  keepAwake(true).then(updateWakeBadge);
  speak(VOICE[state.settings.lang].hello, state.settings.lang);

  if (state.settings.ai) startAiLayer();
}

async function startAiLayer() {
  state.aiStatus = 'loading';
  updateAiBadge();
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
    addNote(navigator.onLine
      ? '🤖 AI could not start on this phone. Normal listening still works.'
      : '🤖 AI needs internet once to download (~15 MB). Normal listening still works.');
  }
  updateAiBadge();
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
  if (s.count >= s.target) {
    reachTarget();
    return;
  }
  chime();
  const left = s.target - s.count;
  setTimeout(() => speak(VOICE[lang].count(s.count) + (left === 1 ? ' ' + VOICE[lang].oneLeft : ''), lang), 350);
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
    big: '🔥',
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
    <main class="fade-in flex min-h-dvh flex-col px-6 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div class="mx-auto mt-8 w-40">${cookerSVG({ flame: false })}</div>
      <h1 class="mt-6 text-3xl font-extrabold">Arre! Mic nahi khula.</h1>
      <p class="mt-3 text-lg">${esc(s.error)}</p>
      <p class="mt-3 text-muted">You can still count by hand with the +1 button.</p>
      <div class="mt-auto grid gap-3 pt-8">
        <button data-retry class="btn-primary rounded-full py-4 text-xl font-extrabold">Try again</button>
        <button data-manual class="rounded-xl btn-line py-4 text-xl font-normal">Count by hand</button>
        <button data-stop class="py-3 font-mono text-sm text-muted">← Back home</button>
      </div>
    </main>`;
  }
  return `
  <main class="fade-in flex min-h-dvh flex-col bg-brown text-cream">
    <div class="relative" style="background:#FFD98E">
      <div class="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <button data-stop class="flex items-center gap-2 rounded-full bg-white/85 px-4 py-2 text-sm font-bold text-ink shadow-sm backdrop-blur" aria-label="Stop listening">${ICONS.stop} Stop</button>
        <span id="aiBadge"></span>
      </div>
      <div id="cookerWrap" class="mx-auto max-w-md pt-10">${cookerSVG({ count: s.count, target: s.target, scene: true, id: 'liveCooker' })}</div>
    </div>

    <section class="relative -mt-7 flex-1 rounded-t-[32px] bg-brown px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-3xl font-extrabold leading-tight">${esc(s.dish.name)} <span class="text-2xl">${esc(s.dish.emoji)}</span></h1>
          <p id="status" class="mt-1 font-semibold text-sand" aria-live="polite"></p>
        </div>
        <div class="relative h-16 w-16 shrink-0" aria-hidden="true">
          <svg viewBox="0 0 64 64" class="absolute inset-0 -rotate-90">
            <circle cx="32" cy="32" r="29" fill="none" stroke="var(--brown-2)" stroke-width="5"/>
            <circle id="earRing" class="ear-ring" cx="32" cy="32" r="29" fill="none" stroke="var(--haldi)" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>
          </svg>
          <span id="earDot" class="absolute inset-2 rounded-full bg-cream/15 transition-transform duration-100"></span>
          <span class="absolute inset-0 flex items-center justify-center text-cream">${ICONS.ear}</span>
        </div>
      </div>

      <div id="learnBar" class="mt-3"><div class="bar !bg-brown-2"><div class="!bg-haldi" style="width:0"></div></div></div>

      <div class="mt-5 grid grid-cols-3 divide-x divide-brown-2 border-y border-brown-2 py-3 text-center">
        <div><div id="countText" class="text-xl font-extrabold">${s.count}/${s.target}</div><div class="text-xs font-semibold text-sand/80">Whistles</div></div>
        <div><div class="text-xl font-extrabold">${fmtTime(s.startedAt)}</div><div class="text-xs font-semibold text-sand/80">Started</div></div>
        <div><div id="nextText" class="text-xl font-extrabold">—</div><div class="text-xs font-semibold text-sand/80">Listening</div></div>
      </div>

      <div class="mt-4">
        <div class="flex items-center justify-between text-xs font-semibold text-sand/80"><span>Sound</span><span id="meterNote"></span></div>
        <div class="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-brown-2" aria-hidden="true">
          <div id="meterLevel" class="h-full w-0 rounded-full bg-sand transition-[width] duration-75"></div>
          <div id="meterThr" class="absolute top-0 h-full w-1 rounded bg-haldi" style="left:0"></div>
        </div>
        <p class="mt-1 text-[11px] text-sand/70">A whistle must cross the yellow mark for about 1 second.</p>
      </div>

      <div class="mt-5 grid grid-cols-[1fr_2fr] gap-3">
        <button data-minus class="rounded-full bg-brown-2 py-4 text-xl font-extrabold" aria-label="Remove one whistle">−1</button>
        <button data-plus class="rounded-full bg-cream py-4 text-xl font-extrabold text-brown" aria-label="Add one whistle">+1 seeti</button>
      </div>

      <div class="mt-6">
        <h2 class="font-extrabold">Log</h2>
        <div id="log" class="mt-1">${logList(s.log, true)}</div>
      </div>

      <p class="mt-5 rounded-2xl bg-brown-2 p-3 text-sm text-sand">Keep Seeti open, phone near the kitchen. <span id="wakeNote"></span></p>
    </section>
  </main>`;
}

bind.listen = () => {
  const s = state.session;
  $('[data-stop]').addEventListener('click', () => {
    if (s.count > 0 && !s.error && !confirm('Stop listening? Your count will be lost.')) return;
    stopListening();
    keepAwake(false);
    go('home');
  });
  if (s.error) {
    $('[data-retry]').addEventListener('click', () => startSession());
    $('[data-manual]').addEventListener('click', () => { s.error = null; s.phase = 'manual'; render(); keepAwake(true); });
    return;
  }
  $('[data-plus]').addEventListener('click', () => {
    detector?.pauseFor(6);
    countWhistle('manual');
  });
  $('[data-minus]').addEventListener('click', undoWhistle);
  updateStatus();
  updateAiBadge();
  updateWakeBadge();
  meterLoop();
};

const STATUS = {
  learning: 'Getting to know your kitchen…',
  listening: 'Seeti sun raha hoon…',
  hearing: 'Kuch sun raha hoon…',
  cooldown: 'Mil gayi! ✓',
  manual: 'Manual mode — tap +1 on each seeti',
};

function updateStatus() {
  const s = state.session;
  const el = $('#status');
  if (!el || !s) return;
  let text = STATUS[s.phase] || STATUS.listening;
  if (s.phase === 'listening' && s.target - s.count === 1) text = 'Bas ek aur!';
  if (s.phase === 'listening' && !mic) text = 'Starting the mic…';
  el.textContent = text;
  $('#learnBar')?.classList.toggle('hidden', s.phase !== 'learning');
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
  if (ct) ct.textContent = `${s.count}/${s.target}`;
  const g = $('#gauge');
  if (g) g.innerHTML = gauge(s.count, s.target);
  updateStatus();
}

function renderLog() {
  const el = $('#log');
  if (el && state.session) el.innerHTML = logList(state.session.log, state.screen === 'listen');
}

function updateAiBadge() {
  const el = $('#aiBadge');
  if (!el) return;
  const map = {
    off: ['', ''],
    loading: ['AI loading…', 'bg-white/70 text-muted'],
    on: ['● AI listening', 'bg-leaf text-white'],
    error: ['AI off', 'bg-white/70 text-muted line-through'],
  };
  const [text, cls] = map[state.aiStatus];
  el.className = text ? `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold shadow-sm ${cls}` : '';
  el.textContent = text;
  if (state.aiStatus === 'error') el.title = 'Could not load the AI model (offline?). Sound detection still works.';
}

function updateWakeBadge() {
  const el = $('#wakeNote');
  if (!el) return;
  el.textContent = isAwake() ? 'Screen will stay on.' : "Your browser can't keep the screen on — turn off auto-lock for now.";
}

// Map dB (-90..-10) to 0..100%
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
    const lb = $('#learnBar .bar > div');
    if (lb) lb.style.width = Math.round(L.learnProgress * 100) + '%';
    const next = $('#nextText');
    if (next) {
      next.textContent = L.phase === 'cooldown' ? `${Math.ceil(L.cooldownLeft)}s` : L.phase === 'learning' ? '…' : 'On';
      next.nextElementSibling.textContent = L.phase === 'cooldown' ? 'Next in' : 'Listening';
    }
    const note = $('#meterNote');
    if (note) note.textContent = state.aiLabel && L.ai > 0.15 ? `AI: ${state.aiLabel} ${Math.round(L.ai * 100)}%` : `${Math.round(L.levelDb)} dB`;
  }
  meterRaf = requestAnimationFrame(meterLoop);
}

/* ----------------------------------------------------------------- ALARM */
function showAlarm({ big, title, sub, kind, onStop }) {
  const lang = state.settings.lang;
  const overlay = document.createElement('div');
  overlay.className = 'alarm fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center text-cream';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-label', title.en);
  overlay.tabIndex = 0;
  overlay.innerHTML = `
    <div class="shake text-[120px] leading-none">${big}</div>
    <h1 class="mt-4 text-6xl font-extrabold leading-none">${esc(title[lang] || title.en)}</h1>
    ${lang !== 'en' ? `<p class="mt-3 text-2xl font-normal opacity-90">${esc(sub)}</p>` : ''}
    <p class="mt-6 text-sm font-bold tracking-wide opacity-90">${esc(state.session?.dish.name.toUpperCase() || '')} · ${state.session?.count ?? ''} SEETI</p>
    <button class="mt-12 rounded-full bg-cream px-10 py-4 text-2xl text-mirch">Ho gaya, band kiya ✓</button>
    <p class="mt-4 text-sm font-semibold text-cream/80">Tap anywhere to stop</p>`;
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
  <main class="fade-in flex min-h-dvh flex-col items-center px-6 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
    <span class="label">Safe-to-open timer</span>
    <h1 class="mt-3 text-3xl font-extrabold">Pressure nikal raha hai…</h1>
    <p class="text-muted">Don't open the cooker yet.</p>
    <div class="relative mt-8 aspect-square w-64">
      <svg viewBox="0 0 100 100" class="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--mist)" stroke-width="7"/>
        <circle id="ring" cx="50" cy="50" r="44" fill="none" stroke="var(--brown)" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/>
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center">
        <span id="clock" class="text-6xl font-extrabold tabular-nums">--:--</span>
        <span class="label mt-1">remaining</span>
      </div>
    </div>
    <div class="mt-8 grid w-full grid-cols-2 gap-3">
      <button data-addmin class="rounded-xl btn-line py-4 text-xl font-normal">+1 min</button>
      <button data-skip class="rounded-xl border border-line py-4 text-xl font-normal">Skip</button>
    </div>
    <p class="mt-6 rounded-lg bg-mist p-3 text-sm">📱 Keep Seeti open on screen — phones may silence timers in the background.<br>Always check the cooker yourself before opening it.</p>
  </main>`;
}

bind.release = () => {
  const s = state.session;
  const total = () => state.settings.releaseMin * 60_000 + (s.extraMs || 0);
  const tick = () => {
    const left = Math.max(0, s.releaseEnd - Date.now());
    const m = Math.floor(left / 60000);
    const sec = Math.floor((left % 60000) / 1000);
    const clock = $('#clock');
    if (!clock) return;
    clock.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    $('#ring').setAttribute('stroke-dashoffset', String(100 - (left / total()) * 100));
    if (left <= 0) {
      clearInterval(releaseTimer);
      document.removeEventListener('visibilitychange', tick);
      if (document.querySelector('.alarm')) return;
      showAlarm({
        big: '🍽️',
        title: { hi: 'Cooker khol sakte ho!', en: 'Open the cooker!', gu: 'કૂકર ખોલી શકો!' },
        sub: 'Pressure is released.',
        kind: 'released',
        onStop: () => { keepAwake(false); go('done'); },
      });
    }
  };
  clearInterval(releaseTimer);
  releaseTimer = setInterval(tick, 250);
  document.addEventListener('visibilitychange', tick); // ring right away when the user comes back
  tick();
  $('[data-addmin]').addEventListener('click', () => { s.releaseEnd += 60_000; s.extraMs = (s.extraMs || 0) + 60_000; tick(); });
  $('[data-skip]').addEventListener('click', () => { clearInterval(releaseTimer); document.removeEventListener('visibilitychange', tick); keepAwake(false); go('done'); });
};

/* ------------------------------------------------------------------ DONE */
function done() {
  const s = state.session;
  const mins = s.endedAt ? Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000)) : null;
  return `
  <main class="fade-in flex min-h-dvh flex-col px-6 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
    <span class="label">Done</span>
    <h1 class="mt-2 text-6xl font-extrabold">Ho gaya!</h1>
    <p class="mt-1 text-lg text-muted">${esc(s.dish.name)} · ${s.count} seeti${mins ? ` · ${mins} min` : ''}. Khana tayyar!</p>
    <div class="mx-auto mt-4 w-56">${cookerSVG({ count: s.count, flame: false })}</div>
    <section class="mt-4"><h2 class="label">Log</h2><div class="mt-1">${logList(s.log)}</div></section>
    <div class="mt-auto grid gap-3 pt-8">
      <button data-again class="btn-primary rounded-full py-4 text-xl font-extrabold">Cook something else</button>
    </div>
  </main>`;
}

bind.done = () => {
  $('[data-again]').addEventListener('click', () => { state.session = null; go('home'); });
};

/* ------------------------------------------------------------ CALIBRATE */
const cal = { step: 'intro', result: null, live: null, error: null };

function calibrateView() {
  const r = cal.result;
  const body = {
    intro: `
      <ol class="mt-6 space-y-4 text-lg">
        <li class="flex gap-3"><span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mist text-sm font-bold">01</span><span>Put your phone where it will be while cooking.</span></li>
        <li class="flex gap-3"><span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mist text-sm font-bold">02</span><span>Tap <b>Start</b> and stay quiet for 3 seconds.</span></li>
        <li class="flex gap-3"><span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mist text-sm font-bold">03</span><span>Wait for one real whistle. Seeti will learn how it sounds.</span></li>
      </ol>
      ${state.calib ? `<p class="mt-6 rounded-lg bg-mist p-3">Already tuned: ~${(state.calib.peakHz / 1000).toFixed(1)} kHz, ${Math.round(state.calib.snrDb)} dB above kitchen noise.</p>` : ''}
      <div class="mt-auto grid gap-3 pt-8">
        <button data-cal-start class="btn-primary rounded-full py-4 text-2xl font-extrabold">Start</button>
        ${state.calib ? `<button data-cal-clear class="py-2 font-mono text-sm text-muted underline">Forget my cooker (use defaults)</button>` : ''}
      </div>`,
    run: `
      <p id="calStatus" class="mt-8 text-center text-2xl font-normal">Shhh… learning the quiet</p>
      <div class="mx-auto mt-2 w-56"><div id="calCooker">${cookerSVG({ flame: true, id: 'calSvg' })}</div></div>
      <div class="mt-4 h-5 overflow-hidden rounded-full bg-mist"><div id="calLevel" class="h-full w-0 bg-ink-2 transition-[width] duration-75"></div></div>
      <p id="calNote" class="mt-2 text-center font-mono text-xs text-muted"></p>
      <div class="mt-auto grid gap-3 pt-8">
        <button data-cal-now disabled class="rounded-xl btn-line py-4 text-xl font-normal disabled:opacity-30">That was the whistle</button>
        <button data-cal-cancel class="py-2 font-mono text-sm text-muted">Cancel</button>
      </div>`,
    result: r ? `
      <div class="mx-auto mt-6 w-48">${cookerSVG({ flame: false })}</div>
      <h2 class="mt-4 text-4xl font-extrabold">Samajh gaya!</h2>
      <dl class="mt-4 grid grid-cols-2 gap-3">
        <div class="rounded-2xl bg-white p-4 shadow-sm"><dt class="label">Pitch</dt><dd class="text-3xl font-extrabold">${(r.peakHz / 1000).toFixed(1)} kHz</dd></div>
        <div class="rounded-2xl bg-white p-4 shadow-sm"><dt class="label">Loudness</dt><dd class="text-3xl font-extrabold">+${Math.round(r.snrDb)} dB</dd></div>
        <div class="rounded-2xl bg-white p-4 shadow-sm"><dt class="label">Band</dt><dd class="font-mono">${(r.band[0] / 1000).toFixed(1)}–${(r.band[1] / 1000).toFixed(1)} kHz</dd></div>
        <div class="rounded-2xl bg-white p-4 shadow-sm"><dt class="label">Length</dt><dd class="font-mono">${r.durationSec.toFixed(1)} s</dd></div>
      </dl>
      ${r.snrDb < 8 ? `<p class="mt-4 rounded-lg bg-mirch/10 p-3 text-mirch">That was quite soft. Move the phone a bit closer to the cooker for best results.</p>` : ''}
      <div class="mt-auto grid gap-3 pt-8">
        <button data-cal-save class="btn-primary rounded-full py-4 text-2xl font-extrabold">Save</button>
        <button data-cal-start class="rounded-xl btn-line py-3 text-lg font-normal">Try again</button>
      </div>` : '',
    fail: `
      <h2 class="mt-10 text-3xl font-extrabold">Seeti suni nahi.</h2>
      <p class="mt-2 text-lg">${esc(cal.error || '')}</p>
      <div class="mt-auto grid gap-3 pt-8">
        <button data-cal-start class="btn-primary rounded-full py-4 text-2xl font-extrabold">Try again</button>
        <button data-cal-cancel class="py-2 font-mono text-sm text-muted">Back</button>
      </div>`,
  }[cal.step];

  return `
  <main class="fade-in flex min-h-dvh flex-col px-6 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
    <button data-cal-back class="self-start font-mono text-sm text-muted">← Back</button>
    <span class="label mt-6">One-time setup · 1 min</span>
    <h1 class="mt-1 text-4xl font-extrabold leading-tight">Learn my cooker's whistle</h1>
    ${body}
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
  $('[data-cal-back]')?.addEventListener('click', back);
  $('[data-cal-cancel]')?.addEventListener('click', back);
  $('[data-cal-clear]')?.addEventListener('click', () => { remove('calib'); state.calib = null; render(); });
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
        st.textContent = u.phase === 'learning' ? 'Shhh… learning the quiet'
          : u.phase === 'hearing' ? 'Sun raha hoon! Keep going…' : 'Ready! Waiting for a whistle…';
        $('#calSvg')?.classList.toggle('hearing', u.phase === 'hearing');
        const now = $('[data-cal-now]');
        if (now) now.disabled = (u.heardSec || 0) < 0.5;
        $('#calLevel').style.width = dbToPct(u.levelDb) + '%';
        $('#calNote').textContent = u.phase === 'learning'
          ? `${Math.round(u.progress * 100)}%`
          : `${Math.round(u.levelDb)} dB · heard ${(u.heardSec || 0).toFixed(1)}s`;
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
          ? "Didn't hear a whistle in 90 seconds. Try again when the cooker is about to whistle."
          : 'The sound was too short. Wait for a full whistle (at least 1 second).';
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
      addNote('⚠️ The phone turned the mic off. Tap Stop and start again.');
    }
    const gone = (Date.now() - hiddenAt) / 1000;
    if (gone > 5) addNote(`⚠️ Seeti was in the background ${fmtTime(hiddenAt)}–${fmtTime(new Date())}. Check the count.`);
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

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// Warm up the AI model in the background on Wi-Fi-ish idle time, so the first cook is ready offline.
if (state.settings.ai && 'requestIdleCallback' in window && navigator.onLine && !navigator.connection?.saveData) {
  requestIdleCallback(() => import('./yamnet.js').then((m) => m.preloadYamnet()).catch(() => {}), { timeout: 8000 });
}

// Silence an unused-import warning on browsers without voices; also exposes for debugging.
window.__seeti = { state, hasVoiceFor };
