// The hero illustration: a pressure cooker on a gas stove, in flat, quiet greys.
// Only the flame keeps a little turmeric colour.

export function cookerSVG({ count = null, target = null, flame = true, scene = false, id = 'cooker' } = {}) {
  const showCount = count != null;
  return `
<svg id="${id}" class="cooker" viewBox="0 0 320 300" role="img" aria-label="${showCount ? `Pressure cooker: ${count} of ${target ?? count} whistles` : 'Pressure cooker'}">
  ${scene ? sceneSVG() : ''}
  <!-- steam puffs (animated on each whistle) -->
  <g class="steam" fill="var(--paper)" stroke="var(--ink)" stroke-width="2">
    <circle class="puff p1" cx="140" cy="44" r="12"/>
    <circle class="puff p2" cx="160" cy="34" r="16"/>
    <circle class="puff p3" cx="122" cy="30" r="9"/>
    <circle class="puff p4" cx="178" cy="50" r="8"/>
  </g>
  <!-- whistle weight -->
  <g class="whistle">
    <rect x="134" y="70" width="12" height="20" fill="var(--ink)"/>
    <rect x="124" y="56" width="32" height="20" rx="6" fill="var(--ink)"/>
    <circle cx="140" cy="54" r="4" fill="var(--ink)"/>
  </g>
  <!-- handle -->
  <path d="M232 98 L304 87 Q312 86 312 94 L312 100 Q312 106 304 107 L232 117 Z" fill="var(--ink)"/>
  <rect x="226" y="95" width="12" height="24" rx="3" fill="var(--ink-3)"/>
  <!-- lid -->
  <rect x="38" y="90" width="204" height="20" rx="10" fill="var(--ink-3)"/>
  <rect x="90" y="82" width="100" height="10" rx="5" fill="var(--ink)"/>
  <!-- body -->
  <path d="M50 110 H230 V216 Q230 246 200 246 H80 Q50 246 50 216 Z" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/>
  <rect x="51.5" y="120" width="177" height="5" fill="var(--sand)"/>
  <!-- side handle -->
  <rect x="22" y="130" width="28" height="11" rx="5.5" fill="var(--ink)"/>
  ${showCount ? `
  <text class="cooker-count" x="140" y="${target != null ? 205 : 210}" text-anchor="middle">${count}</text>
  ${target != null ? `<text class="cooker-target" x="140" y="232" text-anchor="middle">OF ${target}</text>` : ''}
  ` : ''}
  <!-- flames -->
  <g class="flames ${flame ? '' : 'off'}">
    ${[100, 126, 154, 180].map((x, i) => `<path class="flame f${i}" d="M${x} 268 q-7 -9 0 -18 q7 9 0 18 z" fill="var(--haldi)"/>`).join('')}
  </g>
  <!-- stove -->
  <rect x="64" y="267" width="152" height="7" rx="2" fill="var(--ink)"/>
  <rect x="24" y="274" width="232" height="12" rx="2" fill="var(--ink-2)"/>
</svg>`;
}

// A kitchen "skyline": jars, bottles and a window, drawn like quiet buildings.
function sceneSVG() {
  return `
  <g class="scene" aria-hidden="true">
    <!-- far row -->
    <rect x="0" y="150" width="34" height="136" fill="var(--sand)"/>
    <rect x="30" y="176" width="26" height="110" fill="var(--mist)"/>
    <rect x="252" y="140" width="40" height="146" fill="var(--sand)"/>
    <rect x="288" y="168" width="32" height="118" fill="var(--mist)"/>
    <!-- window grid, like the building windows -->
    ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${259 + c * 9}" y="${150 + r * 10}" width="6" height="6" fill="var(--ink-2)"/>`).join('')).join('')}
    ${[0, 1].map((r) => [0, 1].map((c) => `<rect x="${7 + c * 11}" y="${162 + r * 11}" width="7" height="7" fill="var(--ink-2)" opacity=".7"/>`).join('')).join('')}
    <!-- jars -->
    <rect x="4" y="226" width="26" height="60" rx="4" fill="var(--ink-3)"/>
    <rect x="8" y="218" width="18" height="9" rx="2" fill="var(--ink)"/>
    <rect x="262" y="214" width="22" height="72" rx="4" fill="var(--ink-3)"/>
    <rect x="266" y="204" width="14" height="11" rx="2" fill="var(--ink)"/>
    <rect x="288" y="238" width="28" height="48" rx="3" fill="var(--paper)" stroke="var(--ink)" stroke-width="2"/>
    <text x="302" y="267" text-anchor="middle" class="scene-label">मसाला</text>
    <!-- counter top -->
    <rect x="0" y="286" width="320" height="14" fill="var(--ink)"/>
  </g>`;
}

/** Plays the steam + wobble animation once. */
export function puff(svgEl) {
  if (!svgEl) return;
  svgEl.classList.remove('whistling');
  void svgEl.getBoundingClientRect(); // restart the animation
  svgEl.classList.add('whistling');
  setTimeout(() => svgEl.classList.remove('whistling'), 1900);
}

/* Small line icons for the "how it works" row. */
export const ICONS = {
  listen: `<svg viewBox="0 0 48 48" class="h-10 w-10" aria-hidden="true" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round">
    <path d="M14 18 q0 -10 10 -10 q10 0 10 10 q0 6 -5 9 q-3 2 -3 6 q0 6 -6 6"/><path d="M38 14 q4 6 0 12"/><path d="M42 10 q7 10 0 20"/></svg>`,
  count: `<svg viewBox="0 0 48 48" class="h-10 w-10" aria-hidden="true" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round">
    <path d="M10 12 v24"/><path d="M18 12 v24"/><path d="M26 12 v24"/><path d="M34 12 v24"/><path d="M6 30 L40 18"/></svg>`,
  alert: `<svg viewBox="0 0 48 48" class="h-10 w-10" aria-hidden="true">
    <path d="M24 42 c-9 0 -14 -6 -14 -13 c0 -8 7 -12 8 -20 c4 3 6 7 6 11 c2 -2 3 -4 3 -7 c6 5 11 10 11 16 c0 7 -5 13 -14 13 z" fill="var(--ink)"/>
    <path d="M24 42 c-4 0 -6 -3 -6 -6 c0 -4 4 -6 5 -10 c3 3 7 6 7 10 c0 3 -2 6 -6 6 z" fill="var(--haldi)"/></svg>`,
};
