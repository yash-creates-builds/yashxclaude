// Tiny screen router. Screens register { view(params) → html, actions, onEnter?, canLeave? }.
// Taps are handled by one listener: any element with data-act="name" calls actions[name](el, event).

const screens = {};
const navHooks = [];
export const onNavigate = (fn) => navHooks.push(fn);
const globalActions = {};
export const S = { route: { name: 'home', params: {} }, stack: [], sheet: null, anim: 'in' };

export const screen = (name, def) => { screens[name] = def; };
export const actions = (map) => Object.assign(globalActions, map);

const app = () => document.getElementById('app');
const sheetRoot = () => document.getElementById('sheet');

export function go(name, params = {}, { replace = false, reset = false, animate = true } = {}) {
  if (reset) S.stack = [];
  else if (!replace) S.stack.push(S.route);
  S.route = { name, params };
  S.anim = animate ? 'in' : null;
  navHooks.forEach((fn) => fn());
  screens[name]?.onEnter?.(params);
  render();
  window.scrollTo({ top: 0 });
}

/** Returns false if there is nowhere to go back to. */
export function back() {
  if (S.sheet) { closeSheet(); return true; }
  const cur = screens[S.route.name];
  if (cur?.canLeave && !cur.canLeave()) return true;
  if (!S.stack.length) { if (S.route.name !== 'home') { go('home', {}, { reset: true }); return true; } return false; }
  S.route = S.stack.pop();
  S.anim = 'back';
  navHooks.forEach((fn) => fn());
  render();
  return true;
}

export function render() {
  const def = screens[S.route.name] || screens.home;
  const el = app();
  el.innerHTML = def.view(S.route.params);
  const first = el.firstElementChild;
  if (first && S.anim) first.classList.add(S.anim === 'back' ? 'screen-back' : 'screen-in');
  S.anim = null;
  def.afterRender?.(el);
}

/** Re-render without animation and keep scroll (for in-place updates). */
export const refresh = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };

/* ------------------------------------------------------- bottom sheet */
export function openSheet(viewFn, sheetActions = {}) {
  S.sheet = { viewFn, actions: sheetActions };
  document.getElementById('snack').className = 'snack'; // never cover the sheet's buttons
  const root = sheetRoot();
  root.innerHTML = `<div class="scrim" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true">${viewFn()}</div>`;
  root.hidden = false;
  root.querySelector('input')?.focus();
}
export function refreshSheet() { if (S.sheet) sheetRoot().querySelector('.sheet').innerHTML = S.sheet.viewFn(); }
export function closeSheet() {
  S.sheet = null;
  const root = sheetRoot();
  root.hidden = true;
  root.innerHTML = '';
}

/* ------------------------------------------------------- event wiring */
export function startRouter() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const name = el.dataset.act;
    const fn = S.sheet?.actions[name] || screens[S.route.name]?.actions?.[name] || globalActions[name];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  // Inputs: data-input="name" → actions[name](el) on every keystroke; data-change on commit.
  for (const type of ['input', 'change']) {
    document.addEventListener(type, (e) => {
      const name = e.target.dataset?.[type];
      if (!name) return;
      const fn = S.sheet?.actions[name] || screens[S.route.name]?.actions?.[name] || globalActions[name];
      fn?.(e.target, e);
    });
  }
  actions({ 'sheet-close': closeSheet, back: () => back(), go: (el) => go(el.dataset.to, { ...el.dataset }) });
}
