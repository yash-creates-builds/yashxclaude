// The hero illustration: a desi pressure cooker on a gas stove, drawn in flat Bauhaus-ish shapes.

export function cookerSVG({ count = null, target = null, flame = true, shelf = false, id = 'cooker' } = {}) {
  const showCount = count != null;
  return `
<svg id="${id}" class="cooker" viewBox="0 0 320 300" role="img" aria-label="${showCount ? `Pressure cooker: ${count} of ${target} whistles` : 'Pressure cooker'}">
  ${shelf ? shelfSVG() : ''}
  <!-- steam puffs (animated on each whistle) -->
  <g class="steam" fill="#FFFDF8" stroke="var(--ink)" stroke-width="3">
    <circle class="puff p1" cx="140" cy="44" r="13"/>
    <circle class="puff p2" cx="160" cy="34" r="17"/>
    <circle class="puff p3" cx="122" cy="30" r="10"/>
    <circle class="puff p4" cx="178" cy="50" r="9"/>
  </g>
  <!-- whistle weight -->
  <g class="whistle">
    <rect x="133" y="70" width="14" height="20" fill="var(--ink)"/>
    <rect x="122" y="54" width="36" height="22" rx="8" fill="var(--ink)"/>
    <circle cx="140" cy="52" r="5" fill="var(--ink)"/>
  </g>
  <!-- handle -->
  <path d="M232 98 L306 86 Q314 85 314 93 L314 101 Q314 107 306 108 L232 118 Z" fill="var(--ink)"/>
  <rect x="226" y="94" width="14" height="26" rx="4" fill="var(--ink-2)"/>
  <!-- lid -->
  <rect x="36" y="88" width="208" height="24" rx="12" fill="var(--haldi)" stroke="var(--ink)" stroke-width="4"/>
  <rect x="88" y="80" width="104" height="12" rx="6" fill="var(--ink)"/>
  <!-- body -->
  <path d="M50 112 H230 V214 Q230 246 198 246 H82 Q50 246 50 214 Z" fill="#FFFDF8" stroke="var(--ink)" stroke-width="4"/>
  <rect x="50" y="122" width="180" height="8" fill="var(--tan)"/>
  <!-- side handle -->
  <rect x="18" y="130" width="32" height="14" rx="7" fill="var(--ink)"/>
  ${showCount ? `
  <text class="cooker-count" x="140" y="${target != null ? 207 : 212}" text-anchor="middle">${count}</text>
  ${target != null ? `<text class="cooker-target" x="140" y="236" text-anchor="middle">of ${target}</text>` : ''}
  ` : `<text class="cooker-count small" x="140" y="200" text-anchor="middle">सीटी</text>`}
  <!-- flames -->
  <g class="flames ${flame ? '' : 'off'}">
    ${[96, 124, 156, 184].map((x, i) => `<path class="flame f${i}" d="M${x} 270 q-9 -10 0 -20 q9 10 0 20 z" fill="${i % 2 ? 'var(--mirch)' : 'var(--haldi)'}"/>`).join('')}
  </g>
  <!-- stove -->
  <rect x="60" y="268" width="160" height="10" rx="3" fill="var(--ink)"/>
  <rect x="20" y="278" width="240" height="14" rx="4" fill="var(--ink-2)"/>
</svg>`;
}

// A quiet kitchen-shelf silhouette behind the cooker (jars, dabba, rolling pin).
function shelfSVG() {
  return `
  <g class="shelf" aria-hidden="true">
    <rect x="0" y="150" width="320" height="130" fill="var(--tan)" opacity=".55"/>
    <rect x="252" y="196" width="34" height="84" rx="6" fill="var(--tan-2)"/>
    <rect x="256" y="186" width="26" height="12" rx="3" fill="var(--ink-2)" opacity=".5"/>
    <rect x="290" y="216" width="26" height="64" rx="6" fill="var(--tan-2)" opacity=".8"/>
    <rect x="4" y="206" width="30" height="74" rx="5" fill="var(--tan-2)"/>
    <rect x="8" y="196" width="22" height="12" rx="3" fill="var(--ink-2)" opacity=".5"/>
    <circle cx="266" cy="232" r="5" fill="var(--haldi)" opacity=".8"/>
    <circle cx="19" cy="240" r="5" fill="var(--mirch)" opacity=".6"/>
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
