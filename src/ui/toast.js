// Kurze Einblendungen (z. B. „+5 XP“) unten in der Mitte.
import { add, h } from '../dom.js';
import { icon } from './icons.js';

export function toast(text, { type = 'info', iconName = null, duration = 2200 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = h('div', { class: ['toast', `toast-${type}`] }, iconName ? icon(iconName, { size: 18 }) : null, h('span', {}, text));
  add(root, el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

export function xpToast(amount) {
  toast(`+${amount} XP`, { type: 'xp', iconName: 'star' });
}
