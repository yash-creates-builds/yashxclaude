// Instrument Sans for Latin, Noto Sans for Hindi + Gujarati (neutral, same proportions).
// Bundled with the app, so they work offline.
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/noto-sans-devanagari';
import '@fontsource-variable/noto-sans-gujarati';
import './style.css';

import { initDB, getDB, onChange } from './core/db.js';
import { setLang, guessLang } from './i18n/index.js';
import { startRouter, actions, go, back, render, S, closeSheet, onNavigate, refresh } from './ui/router.js';
import { hideSnackOnNavigate } from './ui/kit.js';
import { onBackButton, haptic } from './platform/native.js';
import { startAnalytics } from './platform/analytics.js';
import { startSharing, family } from './features/sharing/index.js';
import { applyGrandma } from './screens/settings.js';
import { resetBillMonth } from './screens/bill.js';

// Screens register themselves on import.
import './screens/home.js';
import './screens/give.js';
import './screens/receive.js';
import './screens/batch.js';
import './screens/history.js';
import './screens/bill.js';
import './screens/rates.js';
import './screens/settings.js';
import './screens/visits.js';

let tabPending = false;
function switchTab(to, el) {
  if (tabPending) return;
  if (to === S.route.name) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (el) {
    document.querySelectorAll('.tab.on').forEach((t) => t.classList.remove('on'));
    el.classList.add('on');
  }
  haptic();
  tabPending = true;
  // Two frames: the lit tab is painted first, then the new screen is drawn.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    tabPending = false;
    if (to === 'bill') resetBillMonth();
    go(to, {}, { reset: true, animate: false });
    if (to !== 'home') S.stack = [{ name: 'home', params: {} }];
  }));
}

async function boot() {
  const db = await initDB();
  setLang(db.settings.lang || guessLang());
  applyGrandma(db.settings.grandma);
  startRouter();
  onNavigate(hideSnackOnNavigate);
  // Changes from other family phones (or sync status) → redraw, unless someone is typing.
  const redrawSoon = () => {
    const typing = document.activeElement?.matches?.('input, select, textarea');
    if (!typing && S.route.name !== 'welcome') refresh();
  };
  onChange((_db, _label, meta) => { if (meta?.remote) redrawSoon(); });
  family.onStatus(redrawSoon);
  startSharing();
  startAnalytics();
  actions({
    tab: (el) => switchTab(el.dataset.to),
  });
  // Bottom tabs react the moment a finger touches them (not after the tap ends):
  // light up the tab now, draw the screen on the next frame, no slide animation.
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.tab');
    if (!el || e.button > 0) return;
    e.preventDefault();
    switchTab(el.dataset.to, el);
  });
  onBackButton(() => back());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) closeSheet(); });

  if (!getDB().settings.lang) { S.route = { name: 'welcome', params: {} }; render(); }
  else go('home', {}, { reset: true });
}

boot();
