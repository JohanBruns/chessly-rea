// Lernpfad einer Study: isometrische Kacheln im Zickzack (SVG).
// Zustände: locked | available | completed; Icons: Play (Video), Buch (Lernen), Shuffle (Drill), Schloss.
import { iconMarkup } from './icons.js';

const W = 84; // Breite der Oberseite
const H = 48; // Höhe der Oberseite
const D = 13; // Dicke
const SX = 48; // Versatz zur Nachbarkachel
const SY = 34;
const PAD = 14;
const ZIGZAG = [0, 1, 0, -1];

export function tileLabel(tile) {
  if (tile.type === 'video') return 'Video ansehen';
  if (tile.type === 'drill') return `Drill: alle ${tile.lines.length} Varianten gemischt`;
  const last = tile.firstVariation + tile.lines.length - 1;
  return tile.lines.length > 1 ? `Varianten ${tile.firstVariation}–${last} lernen` : `Variante ${tile.firstVariation} lernen`;
}

// Raster-Positionen: Kacheln laufen im Zickzack nach unten, das Video sitzt links neben der ersten
export function tileLayout(entries) {
  const out = [];
  let i = 0;
  for (const entry of entries) {
    if (entry.tile.type === 'video') out.push({ ...entry, col: -1, row: 1 });
    else {
      out.push({ ...entry, col: ZIGZAG[i % ZIGZAG.length], row: i });
      i++;
    }
  }
  return out;
}

function iconFor(tile, status) {
  if (status === 'locked') return 'lock';
  if (tile.type === 'video') return 'play';
  if (tile.type === 'drill') return 'shuffle';
  return 'book';
}

const pts = (list) => list.map(([x, y]) => `${x},${y}`).join(' ');

export function tilePath(entries, { hrefFor, current } = {}) {
  const placed = tileLayout(entries);
  const rows = Math.max(2, ...placed.map((p) => p.row + 1));
  const width = 2 * SX + W + 2 * PAD;
  const height = (rows - 1) * SY + H + D + 2 * PAD;
  const cx0 = width / 2;
  const cy0 = PAD + H / 2;

  const parts = placed
    .sort((a, b) => a.row - b.row)
    .map(({ tile, status, col, row }) => {
      const x = cx0 + col * SX;
      const y = cy0 + row * SY;
      const top = pts([
        [x, y - H / 2],
        [x + W / 2, y],
        [x, y + H / 2],
        [x - W / 2, y],
      ]);
      const left = pts([
        [x - W / 2, y],
        [x, y + H / 2],
        [x, y + H / 2 + D],
        [x - W / 2, y + D],
      ]);
      const right = pts([
        [x + W / 2, y],
        [x, y + H / 2],
        [x, y + H / 2 + D],
        [x + W / 2, y + D],
      ]);
      const iconName = iconFor(tile, status);
      const label = tileLabel(tile) + (status === 'locked' ? ' (gesperrt)' : status === 'completed' ? ' (abgeschlossen)' : '');
      const done =
        status === 'completed'
          ? `<g class="tile-check" transform="translate(${x + 14},${y - 22})"><circle r="8"/><g transform="translate(-6,-6) scale(0.5)">${iconMarkup('check', { strokeWidth: 3.5 })}</g></g>`
          : '';
      const body = `
        <g class="tile-body">
          <polygon class="tile-side tile-left" points="${left}"/>
          <polygon class="tile-side tile-right" points="${right}"/>
          <polygon class="tile-top" points="${top}"/>
          <g class="tile-icon" transform="translate(${x - 12},${y - 12})">${iconMarkup(iconName, { strokeWidth: 2.2 })}</g>
          ${done}
        </g>`;
      const cls = `tile tile-${status} tile-type-${tile.type}${current === tile.id ? ' tile-current' : ''}`;
      if (status === 'locked' || !hrefFor) {
        return `<g class="${cls}" data-tile="${tile.id}"><title>${label}</title>${body}</g>`;
      }
      const href = hrefFor(tile);
      const external = /^[a-z]+:\/\//i.test(href) ? ' target="_blank" rel="noopener"' : '';
      return `<a class="${cls}" data-tile="${tile.id}" href="${href}"${external} aria-label="${label}"><title>${label}</title>${body}</a>`;
    });

  const wrap = document.createElement('div');
  wrap.className = 'tile-path';
  wrap.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="list">${parts.join('')}</svg>`;
  return wrap;
}
