// Eigene, schlichte Icons (24×24) als SVG – als Element oder als Markup für eingebettete SVGs.
const STROKE = {
  book: 'M3 5.5C5.5 4.5 8.5 4.5 12 6.5c3.5-2 6.5-2 9-1V19c-2.5-1-5.5-1-9 1-3.5-2-6.5-2-9-1z M12 6.5V20',
  shuffle: 'M3 7h3.5c2.5 0 4 1.2 5.2 3.2l1.6 3.6C14.5 15.8 16 17 18.5 17H21 M18 14l3 3-3 3 M3 17h3.5c1.6 0 2.8-.5 3.8-1.5 M13.7 8.5c1-1 2.2-1.5 3.8-1.5H21 M18 4l3 3-3 3',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20c1.2-3.5 4-5 7.5-5s6.3 1.5 7.5 5',
  home: 'M4 11l8-6.5 8 6.5 M6 9.5V20h12V9.5 M10 20v-5h4v5',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  repeat: 'M4 12a8 8 0 0 1 13.7-5.6L20 8.5 M20 4v4.5h-4.5 M20 12a8 8 0 0 1-13.7 5.6L4 15.5 M4 20v-4.5h4.5',
  bot: 'M7 9h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z M12 5.5V9 M9.5 13.5v1 M14.5 13.5v1 M3 13v2 M21 13v2 M12 3.5v.01',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  first: 'M17 5l-7 7 7 7 M7 5v14',
  last: 'M7 5l7 7-7 7 M17 5v14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M16 16l4.5 4.5',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M15.5 8.5l-2 5-5 2 2-5z',
  bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M8.5 20h7',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  arrowLeft: 'M19 12H5 M11 6l-6 6 6 6',
  flip: 'M7 4v16 M4 7l3-3 3 3 M17 20V4 M14 17l3 3 3-3',
  undo: 'M9 14l-5-5 5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  upload: 'M12 20V9 M7 14l5-5 5 5 M5 4h14',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 12.01V12',
};

const FILL = {
  play: 'M8 5.5v13l10.5-6.5z',
  flame: 'M12 2.5c.9 3.3 5.5 5.6 5.5 10.6a5.5 5.5 0 0 1-11 0c0-2.4 1.1-4 2.4-5.1.2 1.8 1 2.8 2.2 3.4C10.6 8.6 11 5.4 12 2.5z',
  dots: 'M6 10.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z M12 10.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z M18 10.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8-4.3-4.1 5.9-.9z',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

// Markup der Pfade (ohne <svg>-Hülle) – für Icons innerhalb größerer SVGs
export function iconMarkup(name, { strokeWidth = 2 } = {}) {
  if (FILL[name]) return `<path d="${FILL[name]}" fill="currentColor"/>`;
  const d = STROKE[name];
  if (!d) throw new Error(`Unbekanntes Icon: ${name}`);
  return `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export function icon(name, { size = 20, cls = '', strokeWidth = 2, title } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', `icon ${cls}`.trim());
  svg.setAttribute('aria-hidden', title ? 'false' : 'true');
  svg.innerHTML = (title ? `<title>${title}</title>` : '') + iconMarkup(name, { strokeWidth });
  return svg;
}

// Eigenes Logo: Raute (wie die Pfad-Kacheln) mit Bauer, daneben die Wortmarke
export function logoMark(size = 30) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', 'logo-mark');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs><linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/>
    </linearGradient></defs>
    <rect x="6" y="6" width="20" height="20" rx="5" transform="rotate(45 16 16)" fill="url(#logoGrad)"/>
    <g fill="var(--accent-ink)">
      <circle cx="16" cy="10.6" r="3"/>
      <path d="M13.2 15.2h5.6a2.6 2.6 0 0 1-.9 1.9l1.1 4.4h-6l1.1-4.4a2.6 2.6 0 0 1-.9-1.9z"/>
      <rect x="11.6" y="21.4" width="8.8" height="2.4" rx="1.1"/>
    </g>`;
  return svg;
}
