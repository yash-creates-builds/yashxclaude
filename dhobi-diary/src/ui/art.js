// Clothes illustrations (64×64 line art) — drawn for this app.
// `.f` = soft fill tint, strokes use currentColor.
const g = (body) => `<svg class="art" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.4" fill="currentColor" stroke="none"/>`;

export const ART = {
  shirt: g(`<path class="f" d="M24 10h16l10 5 8 10-7 6-5-4v27H18V27l-5 4-7-6 8-10z"/><path d="M24 10l8 9 8-9"/><path d="M32 19v29"/>${dot(35, 27)}${dot(35, 35)}${dot(35, 43)}<path d="M38 30h5"/>`),
  tshirt: g(`<path class="f" d="M23 10c2 4 5 6 9 6s7-2 9-6l11 5 7 11-8 5-4-3v26H17V28l-4 3-8-5 7-11z"/><path d="M26 11c1.5 2 3.5 3 6 3s4.5-1 6-3"/>`),
  pant: g(`<path class="f" d="M18 8h28l4 48H37l-5-32-5 32H14z"/><path d="M18 14h28"/><path d="M32 14v10"/>`),
  jeans: g(`<path class="f" d="M18 8h28l4 48H37l-5-32-5 32H14z"/><path d="M18 14h28"/><path d="M22 14c0 5 3 7 7 7M42 14c0 5-3 7-7 7"/><path d="M17 50h9M38 50h9" stroke-dasharray="2 3"/>`),
  kurta: g(`<path class="f" d="M25 8h14l9 5 6 16-6 2-3-9v34H19V22l-3 9-6-2 6-16z"/><path d="M29 8l3 8 3-8"/><path d="M32 16v12"/><path d="M19 44l4 0M45 44h-4"/>${dot(32, 20)}${dot(32, 25)}`),
  saree: g(`<path d="M32 12V9a3 3 0 1 1 3 3"/><path d="M12 24l20-12 20 12"/><path class="f" d="M12 24h40v30H12z"/><path d="M12 46h40M12 50h40"/><path class="f" d="M12 24l24 0-10 30H12z"/><path d="M15 46l4-12M20 46l4-12"/>${dot(42, 32)}${dot(46, 38)}${dot(40, 40)}`),
  salwar: g(`<path class="f" d="M25 8h14l8 5 4 14-5 1-2-7v10l7 21H13l7-21V21l-2 7-5-1 4-14z"/><path d="M28 8c0 4 2 6 4 6s4-2 4-6"/><path d="M20 31h24"/>${dot(26, 40)}${dot(32, 42)}${dot(38, 40)}`),
  dupatta: g(`<path d="M32 12V9a3 3 0 1 1 3 3"/><path d="M14 22l18-10 18 10"/><path class="f" d="M18 22h12v28H18zM34 22h12v20H34z"/><path d="M20 50v5M24 50v5M28 50v5M36 42v5M40 42v5M44 42v5"/>${dot(24, 32)}${dot(24, 40)}${dot(40, 30)}`),
  bedsheet: g(`<rect class="f" x="8" y="22" width="48" height="12" rx="3"/><rect class="f" x="8" y="34" width="48" height="12" rx="3"/><path d="M14 28h20M14 40h20"/><path d="M44 22v24"/>`),
  pillow: g(`<path class="f" d="M12 16c8 3 32 3 40 0 3 10 3 22 0 32-8-3-32-3-40 0-3-10-3-22 0-32z"/><path d="M18 22c7 2 21 2 28 0M18 42c7-2 21-2 28 0"/>`),
  towel: g(`<path d="M8 12h48"/><path class="f" d="M16 12v40h32V12"/><path d="M16 40h32M16 45h32"/><path d="M20 52v4M26 52v4M32 52v4M38 52v4M44 52v4"/>`),
  blouse: g(`<path class="f" d="M24 14c2 4 5 6 8 6s6-2 8-6l9 4 5 10-7 3-3-4v14c-8 3-16 3-24 0V27l-3 4-7-3 5-10z"/><path d="M20 38c8 2 16 2 24 0"/>`),
  kids: g(`<path class="f" d="M24 14h16l8 7-4 6-4-3v12l-3 14h-6l-1-7-1 7h-6l-3-14V24l-4 3-4-6z"/><path d="M28 14c0 3 2 5 4 5s4-2 4-5"/>${dot(32, 26)}${dot(32, 32)}<path d="M44 10l2-4 2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3z" stroke-width="1.8"/>`),
  blazer: g(`<path class="f" d="M22 8l10 6 10-6 10 6 4 40H8l4-40z"/><path d="M22 8l6 22 4-16 4 16 6-22"/><path d="M32 30v24"/>${dot(35, 38)}${dot(35, 45)}<path d="M14 40h8M42 40h8"/>`),
  sherwani: g(`<path class="f" d="M26 8h12l10 6 6 18-6 2-3-9v35H19V25l-3 9-6-2 6-18z"/><path d="M26 8v5h12V8"/><path d="M32 13v42"/>${dot(29, 20)}${dot(29, 28)}${dot(29, 36)}${dot(29, 44)}<path d="M19 50c4-2 8-2 13 0 5-2 9-2 13 0"/>`),
  pieces: g(`<rect class="f" x="10" y="38" width="40" height="14" rx="4"/><rect class="f" x="10" y="24" width="40" height="14" rx="4"/><rect class="f" x="10" y="10" width="40" height="14" rx="4"/><circle cx="50" cy="48" r="11" fill="currentColor" stroke="none"/><path d="M46 48h8M50 44v8" stroke="#fff" stroke-width="2.6"/>`),
  curtain: g(`<path d="M6 10h52"/><path class="f" d="M10 10v44c6 0 10-2 12-6 0-12-4-26-4-38z"/><path class="f" d="M54 10v44c-6 0-10-2-12-6 0-12 4-26 4-38z"/><path d="M17 36h6M41 36h6"/>`),
  other: g(`<path d="M32 22v-3.5a5 5 0 1 0-5-5"/><path class="f" d="M32 22 8 40c-1.5 1.2-.7 3 1 3h46c1.7 0 2.5-1.8 1-3z"/><path d="M48 10v8M44 14h8" stroke-width="2.8"/>`),
};

export const art = (id) => ART[id] || ART.other;
