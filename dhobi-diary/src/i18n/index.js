import en from './en.js';
import hi from './hi.js';
import gu from './gu.js';

export const LANGS = [
  { id: 'en', label: 'English', locale: 'en-IN' },
  { id: 'hi', label: 'हिंदी', locale: 'hi-IN' },
  { id: 'gu', label: 'ગુજરાતી', locale: 'gu-IN' },
];
const DICTS = { en, hi, gu };
let lang = 'en';

export const setLang = (l) => { lang = DICTS[l] ? l : 'en'; document.documentElement.lang = lang; };
export const getLang = () => lang;
export const locale = () => LANGS.find((l) => l.id === lang).locale;

/** t('key') or t('key', arg) for keys that are functions. Falls back to English. */
export function t(key, ...args) {
  const v = DICTS[lang][key] ?? en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

/** Guess the phone's language on first run. */
export function guessLang() {
  const n = (navigator.language || 'en').toLowerCase();
  return n.startsWith('hi') ? 'hi' : n.startsWith('gu') ? 'gu' : 'en';
}

export const money = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
export const fmtDate = (iso, opts = { day: 'numeric', month: 'short' }) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(), opts);
};
export const fmtMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
};
