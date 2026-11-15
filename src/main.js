import '@fontsource/jost/300.css';
import '@fontsource/jost/400.css';
import '@fontsource/jost/500.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
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
  const views = { home, permission, listen, done, release, calibrate: calibrateView };
  app.innerHTML = views[state.screen]();
  bind[state.screen]?.();
}

/* ----------------------------------------------------------------- pieces */
function langPills() {
  return `<div class="flex gap-1" role="radiogroup" aria-label="Voice language">
    ${LANGS.map((l) => `<button data-lang="${l.id}" role="radio" aria-checked="${state.settings.lang === l.id}"
      class="rounded-full border px-3 py-1 text-sm ${state.settings.lang === l.id ? 'border-ink bg-ink text-cream' : 'border-line text-muted'}">${l.label}</button>`).join('')}
  </div>`;
}

function toggle(name, on, label) {
  return `<button data-toggle="${name}" role="switch" aria-checked="${on}" aria-label="${label}"
    class="relative h-7 w-12 shrink-0 rounded-full border-[1.5px] border-ink transition-colors ${on ? 'bg-ink' : 'bg-paper'}">
    <span class="absolute top-[3px] h-[18px] w-[18px] rounded-full transition-all ${on ? 'left-[23px] bg-cream' : 'left-[3px] bg-ink'}"></span>
  </button>`;
}

function gauge(count, target) {
  const pct = Math.round((count / Math.max(target, 1)) * 100);
  return `<div class="bar" aria-hidden="true"><div style="width:${pct}%"></div></div>`;
}

function section(num, title, body, extra = '') {
  return `<section class="mt-8 border-t border-line pt-4">
    <div class="flex items-baseline justify-between"><h2 class="label">${num} — ${title}</h2>${extra}</div>
    ${body}
  </section>`;
}

function logList(log) {
  if (!log.length) return `<p class="py-2 font-mono text-xs text-muted">No whistles yet.</p>`;
  return `<ol class="divide-y divide-line">
    ${log.map((e) => e.type === 'note'
      ? `<li class="py-2 font-mono text-xs text-muted">${esc(e.text)}</li>`
      : `<li class="flex items-center justify-between py-2.5">
          <span class="text-lg">${ordinal(e.n)} seeti</span>
          <span class="font-mono text-xs text-muted">${fmtTime(e.time)} · ${e.source === 'manual' ? 'manual' : e.source === 'ai' ? 'AI' : 'heard'}</span>
        </li>`).join('')}
  </ol>`;
}

/* ------------------------------------------------------------------- HOME */
function settingRow({ title, what, right = '', below = '' }) {
  return `<div class="py-4">
    <div class="flex items-start justify-between gap-4">
      <div><div class="text-lg leading-tight">${title}</div><p class="mt-1 text-sm leading-snug text-muted">${what}</p></div>
      ${right}
    </div>${below}
  </div>`;
}

function home() {
  const d = selected();
  const st = state.settings;
  const calibBadge = state.calib
    ? `<span class="font-mono text-[11px] text-ink">✓ Learned · ${(state.calib.peakHz / 1000).toFixed(1)} kHz</span>`
    : `<span class="font-mono text-[11px] text-muted">Not done yet</span>`;
  return `
  <main class="fade-in px-5 pb-40 pt-[max(1.25rem,env(safe-area-inset-top))]">
    <header class="flex items-center justify-between">
      <span class="label">Voice</span>
      ${langPills()}
    </header>

    <section class="mt-8">
      <h1 class="text-[64px] font-light leading-none tracking-tight">सीटी</h1>
      <p class="label mt-3 !text-ink">Seeti · Whistle counter</p>
      <p class="mt-4 text-lg text-muted">Cooker ki seeti, hum ginenge.</p>
      <div class="mt-5 h-px w-10 bg-ink"></div>
    </section>

    <div class="screen-frame mt-7">
      <div class="flex items-start justify-between px-4 pt-3">
        <div class="w-32"><span class="label !text-[10px] !text-ink">Whistles</span><div class="mt-1.5">${gauge(0, d.count)}</div><span class="font-mono text-[11px]">0%</span></div>
        <span class="font-mono text-sm"><span class="mono-emoji">${d.emoji}</span> × ${d.count}</span>
      </div>
      ${cookerSVG({ scene: true, id: 'heroCooker' })}
    </div>

    <div class="mt-6 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center text-center">
      ${[['listen', 'Suno', 'Listens'], ['count', 'Gino', 'Counts'], ['alert', 'Gas band', 'Alerts']].map(([k, t, s], i) => `
        ${i ? '<span class="font-mono text-muted" aria-hidden="true">→</span>' : ''}
        <div class="flex flex-col items-center gap-1">${ICONS[k]}<span class="text-sm">${t}</span><span class="label !text-[9px]">${s}</span></div>`).join('')}
    </div>

    ${section('01', 'Kya bana rahe ho?', `
      <div class="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Dish">
        ${state.dishes.map((x) => `
          <button class="tile flex flex-col items-center justify-center rounded-xl border border-line bg-paper py-4 ${x.id === 'custom' ? 'col-span-3 !flex-row gap-3 !py-3' : ''}"
            data-dish="${x.id}" role="radio" aria-pressed="${x.id === d.id}" aria-checked="${x.id === d.id}">
            <span class="mono-emoji text-3xl leading-none">${x.emoji}</span>
            <span class="mt-1.5 text-base leading-tight">${x.name}</span>
            <span class="tile-sub font-mono text-[11px] text-muted">${x.count} seeti${x.edited ? ' ✎' : ''}</span>
          </button>`).join('')}
      </div>`, '<span class="label">Dish</span>')}

    ${section('02', 'Kitni seeti?', `
      <div class="mt-3 flex items-center justify-between">
        <button data-step="-1" class="btn-line h-14 w-14 rounded-full text-3xl font-light" aria-label="One less whistle">−</button>
        <div class="text-center">
          <div class="text-7xl font-light leading-none">${d.count}</div>
          <div class="label mt-1">whistles for ${esc(d.name)}</div>
        </div>
        <button data-step="1" class="btn-primary h-14 w-14 rounded-full text-3xl font-light" aria-label="One more whistle">+</button>
      </div>
      <p class="mt-3 text-center text-sm text-muted">Change it once — Seeti remembers it for next time.</p>`)}

    ${section('03', 'Settings', `
      <div class="divide-y divide-line">
        ${settingRow({
          title: "Learn my cooker's whistle",
          what: 'Optional, 1 minute. Seeti listens to one real whistle from <b>your</b> cooker and remembers its sound — so it counts more accurately and ignores other noises.',
          right: `<button data-go="calibrate" class="btn-line shrink-0 rounded-full px-4 py-1.5 text-sm">${state.calib ? 'Redo' : 'Start'}</button>`,
          below: `<div class="mt-2">${calibBadge}</div>`,
        })}
        ${settingRow({
          title: 'Safe-to-open timer',
          what: `After the last whistle and gas off, steam is still inside — opening early is dangerous. Seeti counts down <b>${st.releaseMin} min</b> and tells you when it's safe to open the lid.`,
          right: toggle('releaseOn', st.releaseOn, 'Safe-to-open timer'),
          below: `<div class="mt-3 flex items-center gap-3 ${st.releaseOn ? '' : 'opacity-30'}">
            <button data-rel="-1" class="btn-line h-8 w-8 rounded-full" aria-label="Less time">−</button>
            <span class="w-14 text-center font-mono text-sm">${st.releaseMin} min</span>
            <button data-rel="1" class="btn-line h-8 w-8 rounded-full" aria-label="More time">+</button>
          </div>`,
        })}
        ${settingRow({
          title: 'AI listening',
          what: 'A free sound-recognition model that also checks if a sound is a whistle. Downloads ~15 MB once, runs on your phone.',
          right: toggle('ai', st.ai, 'AI listening'),
        })}
        ${settingRow({
          title: 'Sensitivity',
          what: 'Low = noisy kitchen (fewer false counts). High = phone is far from the cooker.',
          below: `<div class="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Sensitivity">
            ${[['low', 'Low'], ['normal', 'Normal'], ['high', 'High']].map(([v, l]) => `
              <button data-sens="${v}" role="radio" aria-checked="${st.sens === v}"
                class="rounded-full border px-4 py-1 text-sm ${st.sens === v ? 'border-ink bg-ink text-cream' : 'border-sand text-muted'}">${l}</button>`).join('')}
          </div>`,
        })}
      </div>
      <button data-reset class="mt-2 font-mono text-[11px] text-muted underline">Reset dish counts</button>`)}

    <div class="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-cream/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <div class="mx-auto max-w-md">
        <button data-start class="btn-primary flex w-full items-center justify-between rounded-xl px-5 py-4">
          <span class="text-xl">Start listening</span>
          <span class="font-mono text-xs tracking-widest text-sand">${esc(d.name.toUpperCase())} · ${d.count} SEETI →</span>
        </button>
      </div>
    </div>
  </main>`;
}

bind.home = () => {
  $$('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    state.settings.lang = b.dataset.lang;
    saveSettings();
    render();
    unlockAudio();
    speak(VOICE[state.settings.lang].count(1), state.settings.lang);
  }));
  $$('[data-dish]').forEach((b) => b.addEventListener('click', () => {
    state.selectedId = b.dataset.dish;
    save('lastDish', state.selectedId);
    render();
  }));
  $$('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const d = selected();
    const n = Math.max(MIN_COUNT, Math.min(MAX_COUNT, d.count + Number(b.dataset.step)));
    setDishCount(d.id, n);
    state.dishes = getDishes();
    render();
  }));
  $$('[data-rel]').forEach((b) => b.addEventListener('click', () => {
    if (!state.settings.releaseOn) return;
    state.settings.releaseMin = Math.max(1, Math.min(30, state.settings.releaseMin + Number(b.dataset.rel)));
    saveSettings();
    render();
  }));
  $$('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.toggle;
    state.settings[k] = !state.settings[k];
    saveSettings();
    render();
  }));
  $$('[data-sens]').forEach((b) => b.addEventListener('click', () => {
    state.settings.sens = b.dataset.sens;
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
    <h1 class="mt-4 text-4xl font-light leading-tight">Seeti needs your ears… I mean, your mic.</h1>
    <ul class="mt-6 space-y-3 text-lg">
      <li class="flex gap-4 border-t border-line pt-3"><span class="label mt-1.5 !text-ink">01</span><span><b class="font-medium">Why?</b> To hear the cooker whistle and count it for you.</span></li>
      <li class="flex gap-4 border-t border-line pt-3"><span class="label mt-1.5 !text-ink">02</span><span><b class="font-medium">Private.</b> Nothing is recorded, saved or uploaded. Sound is checked live, on your phone, then thrown away.</span></li>
      <li class="flex gap-4 border-t border-line pt-3"><span class="label mt-1.5 !text-ink">03</span><span><b class="font-medium">Tip:</b> Keep Seeti open and the phone near the kitchen. Phones pause the mic when the screen locks — Seeti will try to keep it on.</span></li>
    </ul>
    <p id="permErr" class="mt-4 hidden rounded-lg bg-mirch/10 p-3 text-mirch"></p>
    <div class="mt-auto pt-8">
      <button data-allow class="btn-primary w-full rounded-xl py-4 text-2xl font-light">Allow microphone</button>
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
      <h1 class="mt-6 text-3xl font-light">Arre! Mic nahi khula.</h1>
      <p class="mt-3 text-lg">${esc(s.error)}</p>
      <p class="mt-3 text-muted">You can still count by hand with the +1 button.</p>
      <div class="mt-auto grid gap-3 pt-8">
        <button data-retry class="btn-primary rounded-xl py-4 text-xl font-light">Try again</button>
        <button data-manual class="rounded-xl btn-line py-4 text-xl font-normal">Count by hand</button>
        <button data-stop class="py-3 font-mono text-sm text-muted">← Back home</button>
      </div>
    </main>`;
  }
  const pct = Math.round((s.count / s.target) * 100);
  return `
  <main class="fade-in flex min-h-dvh flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
    <header class="flex items-center justify-between gap-2">
      <span class="label !text-ink"><span class="mono-emoji">${esc(s.dish.emoji)}</span> ${esc(s.dish.name)}</span>
      <span id="aiBadge"></span>
    </header>

    <div class="screen-frame mt-3">
      <div class="flex items-start justify-between px-4 pt-3">
        <div class="w-36">
          <span class="label !text-[10px] !text-ink">Whistles</span>
          <div id="gauge" class="mt-1.5">${gauge(s.count, s.target)}</div>
          <span id="pctText" class="font-mono text-[11px]">${pct}%</span>
        </div>
        <div class="flex items-center gap-3">
          <span id="countText" class="font-mono text-sm">${s.count} / ${s.target}</span>
          <button data-stop class="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-ink" aria-label="Stop listening">
            <svg viewBox="0 0 12 12" class="h-3 w-3"><rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="currentColor"/></svg>
          </button>
        </div>
      </div>
      <div id="cookerWrap">${cookerSVG({ count: s.count, target: s.target, scene: true, id: 'liveCooker' })}</div>
    </div>

    <p id="status" class="mt-4 text-center text-2xl font-light" aria-live="polite"></p>
    <div id="learnBar" class="mx-auto mt-2 w-40"><div class="bar !h-1.5"><div class="!w-0"></div></div></div>

    <section class="mt-4 border-t border-line pt-3">
      <div class="flex items-center justify-between"><span class="label">Sound</span><span id="meterNote" class="font-mono text-[11px] text-muted"></span></div>
      <div class="relative mt-2 h-3 overflow-hidden rounded-full border-[1.5px] border-ink bg-paper" aria-hidden="true">
        <div id="meterLevel" class="h-full w-0 bg-ink-3 transition-[width] duration-75"></div>
        <div id="meterBase" class="absolute top-0 h-full w-px bg-ink" style="left:0"></div>
        <div id="meterThr" class="absolute top-0 h-full w-0.5 bg-mirch" style="left:0"></div>
      </div>
      <div class="mt-2 grid grid-cols-[5rem_1fr] items-center gap-y-2" aria-hidden="true">
        <span class="label !text-[9px]">Seeti tone</span>
        <div class="relative h-1.5 overflow-hidden rounded-full bg-mist">
          <div id="meterTone" class="h-full w-0 bg-ink"></div>
          <div id="meterToneThr" class="absolute top-0 h-full w-0.5 bg-mirch" style="left:0"></div>
        </div>
        <span class="label !text-[9px]">Hold</span>
        <div class="h-1.5 overflow-hidden rounded-full bg-mist"><div id="meterHold" class="h-full w-0 bg-haldi"></div></div>
      </div>
    </section>

    <section class="mt-5 grid grid-cols-[1fr_2fr] gap-3">
      <button data-minus class="btn-line rounded-xl py-5 text-2xl font-light" aria-label="Remove one whistle">−1</button>
      <button data-plus class="btn-primary rounded-xl py-5 text-2xl" aria-label="Add one whistle">+1 seeti</button>
    </section>

    <section class="mt-6 border-t border-line pt-3">
      <h2 class="label">Log</h2>
      <div id="log" class="mt-1">${logList(s.log)}</div>
    </section>

    <p id="tip" class="mt-6 border-l-2 border-ink pl-3 text-sm text-muted">Keep Seeti open, phone near the kitchen. <span id="wakeNote"></span></p>
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
  $('#learnBar')?.classList.toggle('invisible', s.phase !== 'learning');
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
  if (ct) ct.textContent = `${s.count} / ${s.target}`;
  const pt = $('#pctText');
  if (pt) pt.textContent = `${Math.round((s.count / s.target) * 100)}%`;
  const g = $('#gauge');
  if (g) g.innerHTML = gauge(s.count, s.target);
  updateStatus();
}

function renderLog() {
  const el = $('#log');
  if (el && state.session) el.innerHTML = logList(state.session.log);
}

function updateAiBadge() {
  const el = $('#aiBadge');
  if (!el) return;
  const map = {
    off: ['', ''],
    loading: ['AI loading…', 'border-line text-muted'],
    on: ['● AI listening', 'border-ink'],
    error: ['AI off', 'border-line text-muted line-through'],
  };
  const [text, cls] = map[state.aiStatus];
  el.className = text ? `whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${cls}` : '';
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
    level.style.background = L.hot ? 'var(--ink)' : '';
    $('#meterBase').style.left = dbToPct(L.baseline) + '%';
    $('#meterThr').style.left = dbToPct(L.threshold) + '%';
    $('#meterTone').style.width = Math.round(L.ratio * 100) + '%';
    $('#meterToneThr').style.left = Math.round((L.ratioMin ?? 0.45) * 100) + '%';
    $('#meterHold').style.width = Math.round(L.progress * 100) + '%';
    const lb = $('#learnBar .bar > div');
    if (lb) lb.style.cssText = ''; if (lb) lb.style.width = Math.round(L.learnProgress * 100) + '%';
    const note = $('#meterNote');
    if (note) {
      note.textContent = L.phase === 'cooldown'
        ? `next in ${Math.ceil(L.cooldownLeft)}s`
        : state.aiLabel && L.ai > 0.15 ? `AI: ${state.aiLabel} ${Math.round(L.ai * 100)}%` : `${Math.round(L.levelDb)} dB`;
    }
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
    <h1 class="mt-4 text-6xl font-light leading-none">${esc(title[lang] || title.en)}</h1>
    ${lang !== 'en' ? `<p class="mt-3 text-2xl font-normal opacity-90">${esc(sub)}</p>` : ''}
    <p class="mt-6 font-mono text-sm tracking-widest opacity-90">${esc(state.session?.dish.name.toUpperCase() || '')} · ${state.session?.count ?? ''} SEETI</p>
    <button class="mt-12 rounded-full bg-cream px-10 py-4 text-2xl text-mirch">Ho gaya, band kiya ✓</button>
    <p class="mt-4 label !text-cream/80">Tap anywhere to stop</p>`;
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
    <h1 class="mt-3 text-3xl font-light">Pressure nikal raha hai…</h1>
    <p class="text-muted">Don't open the cooker yet.</p>
    <div class="relative mt-8 aspect-square w-64">
      <svg viewBox="0 0 100 100" class="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--mist)" stroke-width="3"/>
        <circle id="ring" cx="50" cy="50" r="44" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/>
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center">
        <span id="clock" class="text-7xl font-light tabular-nums">--:--</span>
        <span class="label mt-1">remaining</span>
      </div>
    </div>
    <div class="mt-8 grid w-full grid-cols-2 gap-3">
      <button data-addmin class="rounded-xl btn-line py-4 text-xl font-normal">+1 min</button>
      <button data-skip class="rounded-xl border border-line py-4 text-xl font-normal">Skip</button>
    </div>
    <p class="mt-6 rounded-lg border-l-2 border-ink !rounded-none bg-transparent p-3 text-sm">📱 Keep Seeti open on screen — phones may silence timers in the background.<br>Always check the cooker yourself before opening it.</p>
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
    <h1 class="mt-2 text-6xl font-light">Ho gaya!</h1>
    <p class="mt-1 text-lg text-muted">${esc(s.dish.name)} · ${s.count} seeti${mins ? ` · ${mins} min` : ''}. Khana tayyar!</p>
    <div class="mx-auto mt-4 w-56">${cookerSVG({ count: s.count, flame: false })}</div>
    <section class="mt-4"><h2 class="label">Log</h2><div class="mt-1">${logList(s.log)}</div></section>
    <div class="mt-auto grid gap-3 pt-8">
      <button data-again class="btn-primary rounded-xl py-4 text-xl font-light">Cook something else</button>
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
        <li class="flex gap-3"><span class="label mt-1.5 !text-ink">01</span><span>Put your phone where it will be while cooking.</span></li>
        <li class="flex gap-3"><span class="label mt-1.5 !text-ink">02</span><span>Tap <b>Start</b> and stay quiet for 3 seconds.</span></li>
        <li class="flex gap-3"><span class="label mt-1.5 !text-ink">03</span><span>Wait for one real whistle. Seeti will learn how it sounds.</span></li>
      </ol>
      ${state.calib ? `<p class="mt-6 rounded-lg border-l-2 border-ink !rounded-none bg-transparent p-3">Already tuned: ~${(state.calib.peakHz / 1000).toFixed(1)} kHz, ${Math.round(state.calib.snrDb)} dB above kitchen noise.</p>` : ''}
      <div class="mt-auto grid gap-3 pt-8">
        <button data-cal-start class="btn-primary rounded-xl py-4 text-2xl font-light">Start</button>
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
      <h2 class="mt-4 text-4xl font-light">Samajh gaya!</h2>
      <dl class="mt-4 grid grid-cols-2 gap-3">
        <div class="rounded-lg border border-line bg-paper p-3"><dt class="label">Pitch</dt><dd class="text-3xl font-light">${(r.peakHz / 1000).toFixed(1)} kHz</dd></div>
        <div class="rounded-lg border border-line bg-paper p-3"><dt class="label">Loudness</dt><dd class="text-3xl font-light">+${Math.round(r.snrDb)} dB</dd></div>
        <div class="rounded-lg border border-line bg-paper p-3"><dt class="label">Band</dt><dd class="font-mono">${(r.band[0] / 1000).toFixed(1)}–${(r.band[1] / 1000).toFixed(1)} kHz</dd></div>
        <div class="rounded-lg border border-line bg-paper p-3"><dt class="label">Length</dt><dd class="font-mono">${r.durationSec.toFixed(1)} s</dd></div>
      </dl>
      ${r.snrDb < 8 ? `<p class="mt-4 rounded-lg bg-mirch/10 p-3 text-mirch">That was quite soft. Move the phone a bit closer to the cooker for best results.</p>` : ''}
      <div class="mt-auto grid gap-3 pt-8">
        <button data-cal-save class="btn-primary rounded-xl py-4 text-2xl font-light">Save</button>
        <button data-cal-start class="rounded-xl btn-line py-3 text-lg font-normal">Try again</button>
      </div>` : '',
    fail: `
      <h2 class="mt-10 text-3xl font-light">Seeti suni nahi.</h2>
      <p class="mt-2 text-lg">${esc(cal.error || '')}</p>
      <div class="mt-auto grid gap-3 pt-8">
        <button data-cal-start class="btn-primary rounded-xl py-4 text-2xl font-light">Try again</button>
        <button data-cal-cancel class="py-2 font-mono text-sm text-muted">Back</button>
      </div>`,
  }[cal.step];

  return `
  <main class="fade-in flex min-h-dvh flex-col px-6 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
    <button data-cal-back class="self-start font-mono text-sm text-muted">← Back</button>
    <span class="label mt-6">One-time setup · 1 min</span>
    <h1 class="mt-1 text-4xl font-light leading-tight">Learn my cooker's whistle</h1>
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
  const back = () => { endCalMic(); cal.step = 'intro'; cal.result = null; keepAwake(false); go('home'); };
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
    go('home');
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
