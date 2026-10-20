// Kleiner Helfer zum Erzeugen von DOM-Elementen: h('div', { class: 'x', onclick }, ...kinder)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false || key === 'value') continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    } else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    } else if (key in el && typeof value !== 'string') {
      el[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : value);
    }
  }
  append(el, children);
  // value erst nach den Kindern setzen, damit <select> seine Optionen schon kennt
  if (attrs && attrs.value !== undefined && attrs.value !== null) el.value = attrs.value;
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// Inhalt ersetzen; null/false/Arrays wie bei h() erlaubt
export function fill(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

// Anhängen; null/false/Arrays wie bei h() erlaubt
export function add(el, ...children) {
  append(el, children);
  return el;
}

export function colorLabel(color) {
  if (color === 'w') return 'Weiß';
  if (color === 'b') return 'Schwarz';
  return 'Beide Farben';
}

export function progressBar(value, total, extraClass = '') {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return h('div', { class: ['progress', extraClass], title: `${value} / ${total}` }, h('div', { class: 'progress-fill', style: { width: `${pct}%` } }));
}

export function formatDue(card, now = Date.now()) {
  if (!card || card.status === 'new') return 'Neu';
  if (card.due <= now) return 'Fällig';
  const days = Math.round((card.due - now) / (24 * 60 * 60 * 1000));
  if (days < 1) {
    const minutes = Math.max(1, Math.round((card.due - now) / 60000));
    return minutes < 60 ? `in ${minutes} Min.` : 'heute';
  }
  return days === 1 ? 'morgen' : `in ${days} Tagen`;
}
