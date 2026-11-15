// Illustrated pressure cooker with bold brown outlines (storybook style).

const O = 'stroke="var(--ink)" stroke-width="3.5" stroke-linejoin="round"';

export function cookerSVG({ count = null, target = null, flame = true, scene = false, id = 'cooker' } = {}) {
  const showCount = count != null;
  return `
<svg id="${id}" class="cooker" viewBox="0 0 320 300" role="img" aria-label="${showCount ? `Pressure cooker: ${count} of ${target ?? count} whistles` : 'Pressure cooker'}">
  ${scene ? sceneSVG() : ''}
  <g class="steam" fill="#FFFFFF" ${O}>
    <circle class="puff p1" cx="140" cy="44" r="12"/>
    <circle class="puff p2" cx="161" cy="33" r="16"/>
    <circle class="puff p3" cx="121" cy="29" r="9"/>
    <circle class="puff p4" cx="180" cy="52" r="8"/>
  </g>
  <g class="whistle" ${O}>
    <rect x="134" y="70" width="12" height="20" fill="var(--ink-2)"/>
    <rect x="123" y="55" width="34" height="21" rx="8" fill="var(--ink-2)"/>
  </g>
  <path d="M232 97 L303 86 Q312 85 312 94 L312 100 Q312 107 303 108 L232 118 Z" fill="var(--ink-2)" ${O}/>
  <rect x="36" y="88" width="208" height="24" rx="12" fill="var(--haldi)" ${O}/>
  <rect x="90" y="80" width="100" height="11" rx="5.5" fill="var(--ink-2)" ${O}/>
  <path d="M50 112 H230 V214 Q230 246 198 246 H82 Q50 246 50 214 Z" fill="#FFFDF8" ${O}/>
  <path d="M62 124 V200" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" opacity=".9"/>
  <path d="M60 124 V200" stroke="var(--sand)" stroke-width="3" stroke-linecap="round"/>
  <rect x="18" y="128" width="32" height="14" rx="7" fill="var(--ink-2)" ${O}/>
  ${showCount ? `
  <text class="cooker-count" x="146" y="${target != null ? 204 : 208}" text-anchor="middle">${count}</text>
  ${target != null ? `<text class="cooker-target" x="146" y="230" text-anchor="middle">of ${target}</text>` : ''}` : ''}
  <g class="flames ${flame ? '' : 'off'}" ${O} stroke-width="2.5">
    ${[98, 126, 154, 182].map((x, i) => `<path class="flame f${i}" d="M${x} 268 q-9 -10 0 -21 q9 11 0 21 z" fill="${i % 2 ? 'var(--mirch)' : '#FF9F1C'}"/>`).join('')}
  </g>
  <rect x="58" y="266" width="164" height="9" rx="4" fill="var(--ink-2)" ${O}/>
</svg>`;
}

// A warm kitchen corner: wall tiles, a tulsi plant and a sunny window.
function sceneSVG() {
  return `
  <g aria-hidden="true">
    <rect x="-40" y="-20" width="400" height="340" fill="#FFD98E"/>
    <circle cx="278" cy="34" r="62" fill="#FFE7B3"/>
    <g stroke="#F5C766" stroke-width="2">
      ${[60, 100, 140, 180, 220].map((y) => `<path d="M-40 ${y} H360"/>`).join('')}
    </g>
    <!-- window -->
    <rect x="252" y="8" width="52" height="52" rx="10" fill="#9ED8F5" ${O}/>
    <path d="M278 8 V60 M252 34 H304" ${O}/>
    <circle cx="292" cy="21" r="6" fill="#FFF3C4"/>
    <!-- plant -->
    <g class="leaf" ${O} stroke-width="3">
      <path d="M28 220 q-26 -34 -6 -70 q16 30 6 70 z" fill="var(--leaf)"/>
      <path d="M30 222 q8 -44 40 -58 q-2 40 -40 58 z" fill="#7BC46A"/>
      <path d="M26 222 q-30 -10 -40 -40 q34 2 40 40 z" fill="#4A9A3B"/>
    </g>
    <path d="M10 220 H48 L44 260 Q43 266 37 266 H21 Q15 266 14 260 Z" fill="#E07A4F" ${O}/>
    <!-- counter -->
    <rect x="-40" y="274" width="400" height="60" fill="var(--brown-3)"/>
    <path d="M-40 274 H360" ${O}/>
  </g>`;
}

export function puff(svgEl) {
  if (!svgEl) return;
  svgEl.classList.remove('whistling');
  void svgEl.getBoundingClientRect();
  svgEl.classList.add('whistling');
  setTimeout(() => svgEl.classList.remove('whistling'), 1900);
}

export const ICONS = {
  ear: `<svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5 2"/><path d="M10 10a2 2 0 0 1 4 0"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>`,
  back: `<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor"/></svg>`,
};
