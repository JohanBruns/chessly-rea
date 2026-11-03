// Rahmen der App: Topbar (Logo links; Streak-Flamme, Avatar, Hamburger rechts),
// Menü als Overlay, Streak-Popover mit Wochenleiste, Theme und Brettfarben.
import { lineStats, loadAllCourses } from '../courses.js';
import { add, clear, fill, h } from '../dom.js';
import { streakInfo } from '../progress.js';
import { loadProgress, loadSettings, loadXp, saveSettings } from '../storage.js';
import { avatar } from './courseIcon.js';
import { icon, logoMark } from './icons.js';

const topbar = document.getElementById('topbar');
// Eigener Container, weil der Blur der Topbar fixierte Kinder auf ihre Höhe begrenzen würde
const menuRoot = document.body.appendChild(document.createElement('div'));
let menuOpen = false;
let popoverOpen = false;
let sessionHeader = null;

export function applyTheme(settings = loadSettings()) {
  document.documentElement.dataset.theme = settings.theme === 'light' ? 'light' : 'dark';
  document.body.dataset.board = settings.boardTheme || 'brown';
}

function dueCount() {
  const lines = loadAllCourses().courses.flatMap((c) => c.lines);
  return lineStats(lines, loadProgress()).due;
}

const MENU = [
  { href: '#/profile', label: 'Profil', icon: 'user', view: 'profile' },
  { href: '#/', label: 'Home', icon: 'home', view: 'home' },
  { href: '#/courses', label: 'Alle Kurse', icon: 'grid', view: 'courses' },
  { href: '#/review', label: 'Wiederholen', icon: 'repeat', view: 'review', badge: dueCount },
  { href: '#/drill', label: 'Drill Shuffle', icon: 'shuffle', view: 'drill' },
  { href: '#/bot', label: 'Gegen den Bot', icon: 'bot', view: 'bot' },
  { href: '#/settings', label: 'Einstellungen', icon: 'gear', view: 'settings' },
  { href: '#/import', label: 'Hinzufügen', icon: 'plus', view: 'import' },
];

function goBack() {
  // Direkt geöffnete Unterseite: kein Verlauf, also zur Startseite
  if (history.length > 1) history.back();
  else location.hash = '#/';
}

function closeAll() {
  menuOpen = false;
  popoverOpen = false;
  renderTopbar();
}

function streakPopover(info) {
  return h(
    'div',
    { class: 'popover streak-popover', role: 'dialog', 'aria-label': 'Streak' },
    h(
      'div',
      { class: 'streak-big' },
      icon('flame', { size: 34, cls: info.activeToday ? 'flame-on' : 'flame-off' }),
      h('div', {}, h('strong', {}, `${info.current} ${info.current === 1 ? 'Tag' : 'Tage'}`), h('span', { class: 'muted small' }, 'Streak')),
    ),
    h(
      'div',
      { class: 'week-bar' },
      info.week.map((d) =>
        h(
          'div',
          { class: ['week-day', d.active ? 'active' : '', d.isToday ? 'today' : ''] },
          h('span', { class: 'week-dot' }, d.active ? icon('flame', { size: 16 }) : null),
          h('span', { class: 'week-label' }, d.label),
        ),
      ),
    ),
    h('p', { class: 'muted small' }, info.activeToday ? 'Heute schon trainiert – stark! Komm morgen wieder, um die Serie zu halten.' : 'Trainiere heute eine Variante, um deine Serie zu halten.'),
  );
}

function menuOverlay(settings) {
  const view = document.body.dataset.view;
  const themeSwitch = h(
    'button',
    {
      class: 'menu-item theme-toggle',
      role: 'switch',
      'aria-checked': String(settings.theme !== 'light'),
      onclick: () => {
        const s = loadSettings();
        s.theme = s.theme === 'light' ? 'dark' : 'light';
        saveSettings(s);
        applyTheme(s);
        renderTopbar();
      },
    },
    icon('moon', { size: 20 }),
    h('span', {}, 'Dunkles Design'),
    h('span', { class: ['switch', settings.theme === 'light' ? '' : 'on'] }, h('span', { class: 'switch-knob' })),
  );
  return h(
    'div',
    { class: 'menu-overlay', onclick: (e) => e.target === e.currentTarget && closeAll() },
    h(
      'nav',
      { class: 'menu-panel', 'aria-label': 'Hauptmenü' },
      h(
        'div',
        { class: 'menu-head' },
        avatar(settings.name, { size: 40 }),
        h('div', {}, h('strong', {}, settings.name), h('a', { class: 'small link-accent', href: '#/profile', onclick: closeAll }, 'Profil ansehen')),
        h('button', { class: 'icon-btn menu-close', 'aria-label': 'Menü schließen', onclick: closeAll }, icon('close')),
      ),
      MENU.map((item) => {
        const badge = item.badge ? item.badge() : 0;
        return h(
          'a',
          { class: ['menu-item', view === item.view ? 'active' : ''], href: item.href, onclick: closeAll },
          icon(item.icon, { size: 20 }),
          h('span', {}, item.label),
          badge ? h('span', { class: 'menu-badge' }, String(badge)) : null,
        );
      }),
      h('div', { class: 'menu-sep' }),
      themeSwitch,
    ),
  );
}

export function renderTopbar() {
  const settings = loadSettings();
  const xp = loadXp();
  const info = streakInfo(xp.byDay);
  clear(topbar);

  const left = sessionHeader || h('a', { class: 'brand', href: '#/', 'aria-label': 'Startseite' }, logoMark(32), h('span', { class: 'brand-word' }, h('strong', {}, 'rea'), h('span', {}, 'openings')));
  // Die installierte iPhone-App hat keinen Browser-Zurück-Button
  const backBtn =
    document.body.dataset.view === 'home'
      ? null
      : h('button', { class: 'icon-btn topbar-back', 'aria-label': 'Zurück', onclick: goBack }, icon('arrowLeft', { size: 22 }));

  const streakBtn = h(
    'button',
    {
      class: ['streak-btn', info.activeToday ? 'on' : ''],
      'aria-label': `Streak: ${info.current} Tage`,
      'aria-expanded': String(popoverOpen),
      onclick: (e) => {
        e.stopPropagation();
        popoverOpen = !popoverOpen;
        menuOpen = false;
        renderTopbar();
      },
    },
    icon('flame', { size: 22 }),
    h('span', {}, String(info.current)),
  );

  add(
    topbar,
    h('div', { class: 'topbar-left' }, backBtn, left),
    h(
      'div',
      { class: 'topbar-right' },
      h('div', { class: 'streak-wrap' }, streakBtn, popoverOpen ? streakPopover(info) : null),
      h('a', { class: 'avatar-link', href: '#/profile', 'aria-label': 'Profil' }, avatar(settings.name, { size: 34 })),
      h(
        'button',
        {
          class: 'icon-btn hamburger',
          'aria-label': 'Menü öffnen',
          'aria-expanded': String(menuOpen),
          onclick: () => {
            menuOpen = !menuOpen;
            popoverOpen = false;
            renderTopbar();
          },
        },
        icon('menu', { size: 24 }),
      ),
    ),
  );
  fill(menuRoot, menuOpen ? menuOverlay(settings) : null);
}

// Kachel-Sitzungen ersetzen das Logo durch den Kurskopf (Icon, Titel, Kapitel)
export function setSessionHeader(el) {
  sessionHeader = el;
  renderTopbar();
}

export function initLayout() {
  applyTheme();
  renderTopbar();
  window.addEventListener('rea:xp', renderTopbar);
  document.addEventListener('click', (e) => {
    if (popoverOpen && !e.target.closest('.streak-wrap')) {
      popoverOpen = false;
      renderTopbar();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (menuOpen || popoverOpen)) {
      e.stopImmediatePropagation();
      closeAll();
    }
  });
}
