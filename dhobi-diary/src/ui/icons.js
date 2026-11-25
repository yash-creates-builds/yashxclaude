// UI icons (24×24, stroke) — drawn for this app.
const s = (d, extra = '') => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const I = {
  home: s('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>'),
  history: s('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4.5h4.5"/><path d="M12 7.5V12l3 2"/>'),
  bill: s('<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  more: s('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6.5l2.6 1.5M17.2 16l2.6 1.5M4.2 17.5 6.8 16M17.2 8l2.6-1.5"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.6"'),
  minus: s('<path d="M5 12h14"/>', 'stroke-width="2.6"'),
  check: s('<path d="m4.5 12.5 5 5 10-11"/>', 'stroke-width="2.6"'),
  back: s('<path d="M15 5 8 12l7 7"/>', 'stroke-width="2.4"'),
  next: s('<path d="m9 5 7 7-7 7"/>', 'stroke-width="2.4"'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>', 'stroke-width="2.4"'),
  share: s('<path d="M12 3v12"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M5 12v7.5h14V12"/>'),
  search: s('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  bell: s('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  trash: s('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  edit: s('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  alert: s('<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>', 'stroke-width="2.2"'),
  give: s('<path d="M12 20V8"/><path d="m7 12 5-5 5 5"/><path d="M4 4h16"/>', 'stroke-width="2.4"'),
  receive: s('<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>', 'stroke-width="2.4"'),
  lang: s('<path d="M4 5h9M8.5 3v2M6 5c.5 3 2.5 6 6 7.5M11 5c-.8 3.5-3 6.5-7 8"/><path d="m13 21 4-9 4 9M14.5 17.5h5"/>'),
  // raised hand = "present!" (attendance)
  hand: s('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5"/><path d="M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L4 14.5a1.6 1.6 0 0 1 2.6-1.8L8 14.5"/>'),
  user: s('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5"/>'),
  calendar: s('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  download: s('<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/>'),
  upload: s('<path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M5 20h14"/>'),
  table: s('<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M10 4v16"/>'),
  rupee: s('<path d="M7 4h11M7 8.5h11M10 4c4 0 5.5 2 5.5 4.5S13.5 13 10 13H7.5l8 7.5"/>'),
  family: s('<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9.5" r="2.5"/><path d="M2.5 20c.7-4 3-6 5.5-6s4.8 2 5.5 6M13.5 15.5c1-1.2 2.2-1.8 3.5-1.8 2.2 0 4 1.8 4.5 6.3"/>'),
  grandma: s('<circle cx="12" cy="9" r="5"/><path d="M7.5 7.5c1.5-3 7.5-3 9 0"/><circle cx="10" cy="9.5" r="1"/><circle cx="14" cy="9.5" r="1"/><path d="M5 21c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5"/>'),
  // services
  iron: s('<path d="M2.5 17.5h17v-2.5a6.5 6.5 0 0 0-6.5-6.5H8.5z"/><path d="M8.5 8.5V6H18"/><path d="M6 14h.01M9 14h.01"/>'),
  wash: s('<rect x="4" y="2.5" width="16" height="19" rx="2.5"/><circle cx="12" cy="13" r="4.5"/><path d="M7.5 6h2M14.5 6h2"/><path d="M9.5 13.5c1.2.9 3.8.9 5 0"/>'),
  dry: s('<path d="M12 9V7.6a2 2 0 1 0-2-2"/><path d="M12 9 3 15.5h18z"/><path d="M19 2.5v4M17 4.5h4"/>'),
};
