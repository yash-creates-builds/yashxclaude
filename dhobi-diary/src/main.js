// Anek (Ek Type): one superfamily drawn for Latin, Devanagari and Gujarati, with a width axis.
// Condensed widths for headings + numbers, normal width for reading. Bundled = works offline.
import '@fontsource-variable/anek-latin/wdth.css';
import '@fontsource-variable/anek-devanagari/wdth.css';
import '@fontsource-variable/anek-gujarati/wdth.css';
import './style.css';

import { initDB, getDB } from './core/db.js';
import { setLang, guessLang } from './i18n/index.js';
import { startRouter, actions, go, back, render, S, closeSheet, onNavigate } from './ui/router.js';
import { hideSnackOnNavigate } from './ui/kit.js';
import { onBackButton } from './platform/native.js';
import { startSharing } from './features/sharing/index.js';
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

async function boot() {
  const db = await initDB();
  setLang(db.settings.lang || guessLang());
  applyGrandma(db.settings.grandma);
  startRouter();
  onNavigate(hideSnackOnNavigate);
  startSharing();
  actions({
    tab: (el) => {
      if (el.dataset.to === 'bill') resetBillMonth();
      if (el.dataset.to === S.route.name) return;
      go(el.dataset.to, {}, { reset: true });
      if (el.dataset.to !== 'home') S.stack = [{ name: 'home', params: {} }];
    },
  });
  onBackButton(() => back());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) closeSheet(); });

  if (!getDB().settings.lang) { S.route = { name: 'welcome', params: {} }; render(); }
  else go('home', {}, { reset: true });
}

boot();
