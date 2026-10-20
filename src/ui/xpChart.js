// XP der letzten 7 Tage als Liniendiagramm mit Fläche, Raster und Hover-Tooltip (eine Reihe).
import { h } from '../dom.js';

const WIDTH = 320;
const HEIGHT = 180;
const M = { top: 12, right: 12, bottom: 24, left: 34 };

function niceMax(value) {
  if (value <= 20) return 20;
  const steps = [25, 50, 100, 150, 200, 300, 500, 1000, 2000, 5000];
  return steps.find((s) => s >= value) || Math.ceil(value / 1000) * 1000;
}

export function xpChart(days) {
  const max = niceMax(Math.max(...days.map((d) => d.xp)));
  const iw = WIDTH - M.left - M.right;
  const ih = HEIGHT - M.top - M.bottom;
  const x = (i) => M.left + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v) => M.top + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * max));

  const points = days.map((d, i) => [x(i), y(d.xp)]);
  const line = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = `${line} L${x(days.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  const svg = `
    <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" class="xp-chart-svg" role="img" aria-label="XP der letzten 7 Tage">
      <defs><linearGradient id="xpArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity="0.32"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient></defs>
      ${ticks.map((t) => `<line class="grid" x1="${M.left}" x2="${WIDTH - M.right}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${M.left - 8}" y="${y(t) + 3.5}" text-anchor="end">${t}</text>`).join('')}
      ${days.map((d, i) => `<text class="axis" x="${x(i)}" y="${HEIGHT - 6}" text-anchor="middle">${d.label}</text>`).join('')}
      <path d="${area}" fill="url(#xpArea)"/>
      <path d="${line}" class="xp-line"/>
      ${points.map(([px, py], i) => `<circle class="xp-dot${i === days.length - 1 ? ' today' : ''}" cx="${px}" cy="${py}" r="4"/>`).join('')}
      <line class="crosshair" x1="0" x2="0" y1="${M.top}" y2="${M.top + ih}" visibility="hidden"/>
      <rect class="hit" x="${M.left - 10}" y="0" width="${iw + 20}" height="${HEIGHT}" fill="transparent"/>
    </svg>`;

  const tooltip = h('div', { class: 'chart-tip', hidden: true });
  const wrap = h('div', { class: 'xp-chart' }, tooltip);
  wrap.insertAdjacentHTML('afterbegin', svg);
  const svgEl = wrap.querySelector('svg');
  const cross = svgEl.querySelector('.crosshair');
  const dots = [...svgEl.querySelectorAll('.xp-dot')];

  const hide = () => {
    tooltip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
    dots.forEach((d) => d.classList.remove('hover'));
  };
  svgEl.querySelector('.hit').addEventListener('pointermove', (e) => {
    const rect = svgEl.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const i = Math.max(0, Math.min(days.length - 1, Math.round(((sx - M.left) / iw) * (days.length - 1))));
    const [px, py] = points[i];
    cross.setAttribute('x1', px);
    cross.setAttribute('x2', px);
    cross.setAttribute('visibility', 'visible');
    dots.forEach((d, j) => d.classList.toggle('hover', j === i));
    const date = new Date(`${days[i].key}T12:00:00`);
    tooltip.replaceChildren(h('span', { class: 'muted' }, date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })), h('strong', {}, `${days[i].xp} XP`));
    tooltip.hidden = false;
    tooltip.style.left = `${(px / WIDTH) * 100}%`;
    tooltip.style.top = `${(py / HEIGHT) * 100}%`;
  });
  svgEl.querySelector('.hit').addEventListener('pointerleave', hide);
  return wrap;
}
