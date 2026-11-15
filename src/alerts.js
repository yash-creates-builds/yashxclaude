import { LANGS, VOICE } from './i18n.js';

/* ---------- Sound (generated with Web Audio, no files needed) ---------- */
let outCtx = null;

// Must be called from a tap (iOS/Android only allow audio after a user gesture).
export function unlockAudio() {
  try {
    if (!outCtx) outCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (outCtx.state === 'suspended') outCtx.resume();
    // A silent blip fully unlocks iOS.
    const g = outCtx.createGain();
    g.gain.value = 0;
    const o = outCtx.createOscillator();
    o.connect(g).connect(outCtx.destination);
    o.start();
    o.stop(outCtx.currentTime + 0.01);
  } catch { /* no audio */ }
  // Unlock speech too (iOS needs the first utterance inside a gesture).
  try {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  } catch { /* ignore */ }
}

function tone(freq, start, dur, vol = 0.5, type = 'square') {
  if (!outCtx) return;
  const t0 = outCtx.currentTime + start;
  const o = outCtx.createOscillator();
  const g = outCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.setValueAtTime(vol, t0 + dur - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(outCtx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function chime() {
  if (outCtx?.state === 'suspended') outCtx.resume();
  tone(880, 0, 0.18, 0.18, 'sine');
  tone(1320, 0.14, 0.28, 0.16, 'sine');
}

let alarmTimer = null;
let alarmVoiceLine = null;

/** Loud repeating alarm + strong vibration until stopAlarm(). */
export function startAlarm(lang, kind = 'gasOff', prefix = '') {
  stopAlarm();
  if (outCtx?.state === 'suspended') outCtx.resume();
  alarmVoiceLine = (prefix ? prefix + '. ' : '') + (VOICE[lang]?.[kind] ?? VOICE.en[kind]);
  const started = Date.now();
  let round = 0;
  const loop = () => {
    // Nobody came for 2 minutes? Get louder and speak every round.
    const urgent = Date.now() - started > 120_000;
    const vol = urgent ? 1 : 0.7;
    for (let i = 0; i < (urgent ? 4 : 3); i++) {
      tone(1046, i * 0.42, 0.18, vol);
      tone(1568, i * 0.42 + 0.2, 0.18, vol);
    }
    vibrate(urgent ? [800, 100, 800, 100, 800] : [500, 150, 500, 150, 500]);
    if (urgent || round % 2 === 0) setTimeout(() => speak(alarmVoiceLine, lang), 1400);
    round++;
  };
  loop();
  alarmTimer = setInterval(loop, 3600);
}

export function stopAlarm() {
  if (alarmTimer) clearInterval(alarmTimer);
  alarmTimer = null;
  vibrate(0);
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
}

/* ---------- Vibration ---------- */
export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* not supported (iOS) */ }
}

/* ---------- Voice ---------- */
let voices = [];
function refreshVoices() {
  try { voices = speechSynthesis.getVoices(); } catch { voices = []; }
}
if ('speechSynthesis' in window) {
  refreshVoices();
  speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
}

export function speak(text, lang) {
  if (!('speechSynthesis' in window) || !text) return;
  const bcp = LANGS.find((l) => l.id === lang)?.bcp ?? 'en-IN';
  // Strip symbols some voices read aloud ("exclamation point").
  const u = new SpeechSynthesisUtterance(String(text).replace(/[!?¡¿*#~_]/g, ' ').replace(/\s+/g, ' ').trim());
  u.lang = bcp;
  const base = bcp.split('-')[0];
  const voice = voices.find((v) => v.lang?.replace('_', '-') === bcp) || voices.find((v) => v.lang?.startsWith(base));
  if (voice) u.voice = voice;
  u.rate = 0.95;
  u.volume = 1;
  try {
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

export function hasVoiceFor(lang) {
  const base = (LANGS.find((l) => l.id === lang)?.bcp ?? 'en').split('-')[0];
  return voices.length === 0 || voices.some((v) => v.lang?.startsWith(base));
}

/* ---------- Screen Wake Lock ---------- */
let wakeLock = null;
let wantWake = false;

export async function keepAwake(on) {
  wantWake = on;
  if (!('wakeLock' in navigator)) return false;
  try {
    if (on && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
    return true;
  } catch {
    return false;
  }
}

export function isAwake() { return !!wakeLock; }

// The browser drops the lock when the tab is hidden; take it back on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantWake) keepAwake(true);
});
