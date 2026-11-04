// Chessly-Katalog: alle Kurse aus dem Chessly-Konto, die noch nicht in der App sind.
// Jeder Kurs lässt sich vormerken; beim nächsten Öffnen prüft die App, ob er da ist.
import { loadAllCourses } from '../courses.js';
import { loadChesslyCatalog, missingChesslyCourses } from '../chesslyCatalog.js';
import { add, fill, h } from '../dom.js';
import { loadWatchlist } from '../storage.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { activeWatchCount, notificationPermission, requestNotifications, toggleWatch } from '../watchlist.js';

const FILTERS = [
  { id: 'all', label: 'Alle', test: () => true },
  { id: 'opening', label: 'Eröffnungen', test: (c) => c.type === 'OPENING' },
  { id: 'skill', label: 'Skill-Kurse', test: (c) => c.type === 'LEGACY' },
  { id: 'w', label: 'Weiß', test: (c) => c.color === 'w' },
  { id: 'b', label: 'Schwarz', test: (c) => c.color === 'b' },
  { id: 'watch', label: 'Vorgemerkt', test: (c, watch) => Boolean(watch[c.id]) },
];

export function filterChesslyCourses(courses, { filter = 'all', query = '', watch = {} } = {}) {
  const f = FILTERS.find((entry) => entry.id === filter) || FILTERS[0];
  const q = query.trim().toLowerCase();
  return courses.filter(
    (course) =>
      f.test(course, watch) &&
      (!q || `${course.name} ${course.description} ${(course.tags || []).join(' ')}`.toLowerCase().includes(q)),
  );
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function typeLabel(course) {
  return course.type === 'LEGACY' ? 'Skill-Kurs' : 'Eröffnung';
}

function colorLabel(course) {
  if (course.color === 'w') return 'Weiß';
  if (course.color === 'b') return 'Schwarz';
  return null;
}

function thumbnail(course) {
  const fallback = h('div', { class: 'catalog-thumb-fallback', 'aria-hidden': 'true' }, course.name.slice(0, 2).toUpperCase());
  if (!course.imageUrl) return fallback;
  return h('img', {
    class: 'catalog-thumb',
    src: course.imageUrl,
    alt: '',
    loading: 'lazy',
    referrerpolicy: 'no-referrer',
    onerror: (event) => event.target.replaceWith(fallback),
  });
}

export function renderChessly(root, params) {
  const { courses } = loadAllCourses();
  const catalog = loadChesslyCatalog();
  const missing = missingChesslyCourses(courses, catalog);
  let watch = loadWatchlist();
  let filter = FILTERS.some((entry) => entry.id === params.filter) ? params.filter : 'all';
  let query = '';

  const bannerEl = h('div');
  const chipsEl = h('div', { class: 'chips', role: 'tablist' });
  const gridEl = h('div', { class: 'course-grid' });
  const search = h('input', {
    type: 'search',
    class: 'input search-input',
    placeholder: 'Chessly-Kurse durchsuchen …',
    'aria-label': 'Chessly-Kurse durchsuchen',
    oninput: (event) => ((query = event.target.value), renderGrid()),
  });

  function renderBanner() {
    const count = activeWatchCount(watch);
    const permission = notificationPermission();
    if (!count) {
      fill(bannerEl);
      return;
    }
    fill(
      bannerEl,
      h(
        'div',
        { class: 'card watch-banner' },
        h('span', { class: 'watch-banner-icon' }, icon('bell', { size: 22 })),
        h(
          'div',
          { class: 'watch-banner-text' },
          h('strong', {}, `${count} Kurs${count === 1 ? '' : 'e'} vorgemerkt`),
          h(
            'span',
            { class: 'muted small' },
            permission === 'granted'
              ? 'Du bekommst eine Benachrichtigung, sobald ein Kurs in der App auftaucht oder die Videos heruntergeladen sind.'
              : permission === 'denied'
                ? 'Benachrichtigungen sind im Browser blockiert – beim Öffnen der App erscheint trotzdem ein Hinweis.'
                : 'Erlaube Benachrichtigungen, damit du es auch mitbekommst, wenn die App geschlossen ist.',
          ),
        ),
        permission === 'default'
          ? h(
              'button',
              {
                class: 'btn btn-sm btn-primary',
                onclick: async () => {
                  const result = await requestNotifications();
                  if (result === 'granted') toast('Benachrichtigungen sind an.', { iconName: 'bell' });
                  else if (result === 'denied') toast('Benachrichtigungen wurden blockiert.', { iconName: 'bellOff' });
                  renderBanner();
                },
              },
              icon('bell', { size: 16 }),
              'Erlauben',
            )
          : permission === 'granted'
            ? h('span', { class: 'tag tag-watch-on' }, icon('check', { size: 13, strokeWidth: 3 }), 'An')
            : null,
      ),
    );
  }

  function renderChips() {
    fill(
      chipsEl,
      ...FILTERS.map((entry) =>
        h(
          'button',
          {
            class: ['chip', entry.id === filter ? 'active' : ''],
            role: 'tab',
            'aria-selected': String(entry.id === filter),
            onclick: () => ((filter = entry.id), renderChips(), renderGrid()),
          },
          entry.label,
          h('span', { class: 'chip-count' }, String(filterChesslyCourses(missing, { filter: entry.id, watch }).length)),
        ),
      ),
    );
  }

  function card(course) {
    const watched = Boolean(watch[course.id]);
    return h(
      'article',
      { class: ['card', 'catalog-card', course.comingSoon ? 'is-coming' : ''] },
      h(
        'div',
        { class: 'catalog-top' },
        thumbnail(course),
        h(
          'div',
          { class: 'catalog-title' },
          h('h2', {}, course.name),
          h(
            'div',
            { class: 'tags' },
            h('span', { class: 'tag' }, typeLabel(course)),
            colorLabel(course) ? h('span', { class: ['tag', course.color === 'w' ? 'tag-w' : 'tag-b'] }, colorLabel(course)) : null,
            course.comingSoon ? h('span', { class: 'tag tag-soon' }, 'Bald verfügbar') : null,
            course.videosDownloaded ? h('span', { class: 'tag tag-downloaded' }, 'Videos geladen') : null,
          ),
        ),
      ),
      course.description ? h('p', { class: 'muted small catalog-desc' }, course.description) : null,
      h(
        'div',
        { class: 'catalog-actions' },
        h(
          'button',
          {
            class: ['btn', 'btn-sm', watched ? 'btn-primary' : 'btn-ghost'],
            'aria-pressed': String(watched),
            title: watched ? 'Nicht mehr benachrichtigen' : 'Benachrichtigung, sobald der Kurs verfügbar ist',
            onclick: async () => {
              const nowWatched = toggleWatch(course);
              watch = loadWatchlist();
              renderBanner();
              renderChips();
              renderGrid();
              if (nowWatched) {
                toast(`„${course.name}“ vorgemerkt.`, { iconName: 'bell' });
                const permission = await requestNotifications();
                if (permission === 'granted') toast('Benachrichtigungen sind an.', { iconName: 'bell' });
                else if (permission === 'denied') toast('Benachrichtigungen sind blockiert – der Hinweis kommt beim Öffnen der App.', { iconName: 'bellOff' });
                renderBanner();
              } else {
                toast(`„${course.name}“ nicht mehr vorgemerkt.`, { iconName: 'bellOff' });
              }
            },
          },
          icon(watched ? 'bellOff' : 'bell', { size: 16 }),
          watched ? 'Vorgemerkt' : 'Benachrichtigen',
        ),
        h(
          'a',
          { class: 'btn btn-sm btn-ghost', href: course.url, target: '_blank', rel: 'noopener noreferrer' },
          icon('external', { size: 16 }),
          'Auf Chessly',
        ),
      ),
    );
  }

  function emptyState() {
    if (!catalog.courses.length) {
      return h(
        'div',
        { class: 'card empty-state' },
        h('h2', {}, 'Noch kein Chessly-Katalog'),
        h('p', { class: 'muted' }, 'Der Katalog wird einmalig mit deinem Chessly-Login gelesen. Führe dazu im Projektordner aus:'),
        h('p', {}, h('code', {}, 'npm run catalog')),
        h('p', { class: 'muted small' }, 'Danach die App neu bauen bzw. den Dev-Server neu laden. Die Liste liegt in downloader/catalog.json.'),
      );
    }
    if (!missing.length) {
      return h(
        'div',
        { class: 'card empty-state' },
        h('span', { class: 'empty-icon' }, icon('check', { size: 26, strokeWidth: 3 })),
        h('h2', {}, 'Du hast schon alle Chessly-Kurse'),
        h('p', { class: 'muted' }, 'Sobald bei Chessly ein neuer Kurs dazukommt, taucht er nach dem nächsten Katalog-Abgleich hier auf.'),
      );
    }
    return h('div', { class: 'card empty-state' }, h('p', { class: 'muted' }, 'Keine Kurse für diese Auswahl gefunden.'));
  }

  function renderGrid() {
    const list = filterChesslyCourses(missing, { filter, query, watch });
    fill(gridEl, ...list.map(card));
    if (!list.length) add(gridEl, emptyState());
  }

  const updated = formatDate(catalog.fetchedAt);
  const owned = catalog.courses.length - missing.length;

  add(
    root,
    h(
      'div',
      { class: 'page' },
      h(
        'div',
        { class: 'page-head' },
        h('div', { class: 'page-icon' }, icon('bell', { size: 26 })),
        h(
          'div',
          {},
          h('h1', {}, 'Chessly-Kurse'),
          h(
            'p',
            { class: 'muted' },
            catalog.courses.length
              ? `${missing.length} von ${catalog.courses.length} Kursen fehlen noch${owned ? ` · ${owned} hast du schon` : ''}.`
              : 'Alle Kurse aus deinem Chessly-Konto auf einen Blick.',
          ),
        ),
      ),
      bannerEl,
      h('div', { class: 'toolbar' }, h('label', { class: 'search' }, icon('search', { size: 18 }), search), chipsEl),
      h(
        'div',
        { class: 'catalog-hint muted small' },
        icon('download', { size: 15 }),
        h('span', {}, updated ? `Katalog vom ${updated}.` : 'Katalog noch nicht abgeglichen.'),
        h('span', {}, 'Aktualisieren mit'),
        h('code', {}, 'npm run catalog'),
      ),
      gridEl,
    ),
  );
  renderBanner();
  renderChips();
  renderGrid();
  return null;
}
