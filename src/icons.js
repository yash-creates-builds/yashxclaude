// Simple line icons (Material-style, like WhatsApp/YouTube use). Always shown with a text label.
const svg = (d, cls = 'h-6 w-6') =>
  `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const I = {
  back: (c) => svg('<path d="M19 12H5M11 18l-6-6 6-6"/>', c),
  gear: (c) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', c),
  mic: (c) => svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>', c),
  play: (c) => `<svg viewBox="0 0 24 24" class="${c || 'h-6 w-6'}" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>`,
  stop: (c) => `<svg viewBox="0 0 24 24" class="${c || 'h-6 w-6'}" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>`,
  check: (c) => svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', c),
  ticks: (c) => svg('<path d="M2 13l4 4 8-9M10 15l2 2 8-9"/>', c),
  bell: (c) => svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>', c),
  clock: (c) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', c),
  voice: (c) => svg('<path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>', c),
  school: (c) => svg('<path d="M22 10L12 5 2 10l10 5zM6 12v5c3 2 9 2 12 0v-5"/>', c),
  volume: (c) => svg('<path d="M4 9v6M8 6v12M12 3v18M16 7v10M20 10v4"/>', c),
  spark: (c) => svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>', c),
  refresh: (c) => svg('<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5"/>', c),
  lock: (c) => svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', c),
  phone: (c) => svg('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>', c),
  fire: (c) => svg('<path d="M12 22c-4 0-7-3-7-7 0-4 3-6 4-10 2 2 3 4 3 6 1-1 2-2 2-4 3 3 5 6 5 8 0 4-3 7-7 7z"/>', c),
  pot: (c) => svg('<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 10h20M9 10V7h6v3M12 4v3"/>', c),
  history: (c) => svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>', c),
  undo: (c) => svg('<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>', c),
  ear: (c) => svg('<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5 2"/><path d="M10 10a2 2 0 0 1 4 0"/>', c),
};
