// Generiertes Kurs-Icon: Schachbrettmuster im Kurs-Farbton mit der Figur des
// Schlüsselzugs ([CourseIcon "Bf4"] → Läufer, "c6" → Bauer).
import { h } from '../dom.js';

const GLYPHS = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

export function iconPiece(move) {
  const m = String(move || '').trim();
  if (/^O-O/.test(m)) return 'K';
  return GLYPHS[m[0]] ? m[0] : 'P';
}

export function courseIcon(course, { size = 48 } = {}) {
  const hue = course.hue ?? 200;
  const piece = GLYPHS[iconPiece(course.icon)];
  const pieceColor = course.color === 'b' ? 'b' : 'w';
  const squares = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if ((r + c) % 2) squares.push(`<rect x="${c * 12}" y="${r * 12}" width="12" height="12"/>`);
  const el = h('div', {
    class: ['course-icon', `piece-${pieceColor}`],
    style: { '--hue': hue, width: `${size}px`, height: `${size}px` },
    title: course.name,
  });
  el.innerHTML = `
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" class="ci-bg"/>
      <g class="ci-squares">${squares.join('')}</g>
      <text x="24" y="35" text-anchor="middle" class="ci-piece">${piece}</text>
      ${course.icon ? `<text x="44" y="45" text-anchor="end" class="ci-move">${escapeXml(course.icon)}</text>` : ''}
    </svg>`;
  return el;
}

function escapeXml(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
}

// Avatar: Initiale des Namens auf einem Farbkreis
export function avatar(name, { size = 36 } = {}) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  let hash = 0;
  for (const ch of name || '') hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return h('span', { class: 'avatar', style: { '--hue': hash, width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.45)}px` } }, initial);
}
