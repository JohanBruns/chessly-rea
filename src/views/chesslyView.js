// Chessly-Katalog: alle Kurse aus dem Chessly-Konto, die noch nicht in der App sind.
// „Hinzufügen“ legt einen Kurs in die Warteschlange, die der PC mit dem Chessly-Login abarbeitet (downloader/queue_worker.py).
import { addCourse, fetchCourseRequests, isOpenRequest } from '../courseRequests.js';
import { loadAllCourses } from '../courses.js';
import { loadChesslyCatalog, missingChesslyCourses } from '../chesslyCatalog.js';
import { add, fill, h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { watchCourse } from '../watchlist.js';

const REFRESH_MS = 30_000;

const FILTERS = [
  { id: 'all', label: 'Alle', test: () => true },
  { id: 'opening', label: 'Eröffnungen', test: (c) => c.type === 'OPENING' },
  { id: 'skill', label: 'Skill-Kurse', test: (c) => c.type === 'LEGACY' },
  { id: 'w', label: 'Weiß', test: (c) => c.color === 'w' },
  { id: 'b', label: 'Schwarz', test: (c) => c.color === 'b' },
  { id: 'requested', label: 'In Arbeit', test: (c, requests) => isOpenRequest(requests[c.id]) },
];

export function filterChesslyCourses(courses, { filter = 'all', query = '', requests = {} } = {}) {
  const f = FILTERS.find((entry) => entry.id === filter) || FILTERS[0];
  const q = query.trim().toLowerCase();
  return courses.filter(
    (course) =>
      f.test(course, requests) &&
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
  let requests = {};
  const adding = new Set();
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
    const count = Object.values(requests).filter(isOpenRequest).length;
    if (!count) {
      fill(bannerEl);
      return;
    }
    fill(
      bannerEl,
      h(
        'div',
        { class: 'card request-banner' },
        h('span', { class: 'request-banner-icon' }, icon('download', { size: 22 })),
        h(
          'div',
          { class: 'request-banner-text' },
          h('strong', {}, `${count} Kurs${count === 1 ? ' wird' : 'e werden'} hinzugefügt`),
          h('span', { class: 'muted small' }, 'Das kann ein paar Stunden dauern und läuft nur, wenn der PC mit dem Chessly-Login an ist. Der Stand hier ist für alle gleich.'),
        ),
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
          h('span', { class: 'chip-count' }, String(filterChesslyCourses(missing, { filter: entry.id, requests }).length)),
        ),
      ),
    );
  }

  function renderAll() {
    renderBanner();
    renderChips();
    renderGrid();
  }

  async function addToApp(course) {
    adding.add(course.id);
    renderGrid();
    try {
      requests = { ...requests, [course.id]: await addCourse(course.id) };
      watchCourse(course);
      toast(`„${course.name}“ wird hinzugefügt. Das kann ein paar Stunden dauern.`, { iconName: 'download', duration: 5000 });
    } catch (err) {
      toast(err.message, { duration: 5000 });
    }
    adding.delete(course.id);
    renderAll();
  }

  function action(course) {
    const request = requests[course.id];
    const status = (label) => h('button', { class: 'btn btn-sm btn-ghost', disabled: true }, icon('download', { size: 16 }), label);
    if (adding.has(course.id)) return status('Wird angefragt …');
    if (request?.status === 'queued') return status('In Warteschlange');
    if (request?.status === 'running') return status('Wird geladen …');
    if (request?.status === 'done') {
      return h('button', { class: 'btn btn-sm btn-primary', onclick: () => location.reload() }, icon('check', { size: 16, strokeWidth: 3 }), 'Fertig: App neu laden');
    }
    return h(
      'button',
      {
        class: 'btn btn-sm btn-primary',
        disabled: course.comingSoon,
        title: course.comingSoon ? 'Dieser Kurs ist bei Chessly noch nicht erschienen' : null,
        onclick: () => addToApp(course),
      },
      icon('plus', { size: 16 }),
      request?.status === 'failed' ? 'Erneut versuchen' : 'Hinzufügen',
    );
  }

  function card(course) {
    const failure = requests[course.id]?.status === 'failed' ? requests[course.id].message : null;
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
      failure ? h('p', { class: 'small catalog-error' }, failure) : null,
      h('div', { class: 'catalog-actions' }, action(course)),
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
    const list = filterChesslyCourses(missing, { filter, query, requests });
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
        h('div', { class: 'page-icon' }, icon('download', { size: 26 })),
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
  renderAll();

  // Stand der Warteschlange holen; neu aufbauen nur bei Änderungen, sonst flackern die Bilder.
  let shown = '{}';
  const refresh = async () => {
    if (document.hidden) return;
    try {
      const latest = await fetchCourseRequests();
      const text = JSON.stringify(latest);
      if (text === shown) return;
      shown = text;
      requests = latest;
      renderAll();
    } catch (err) {
      console.warn('Stand der Warteschlange nicht ladbar:', err);
    }
  };
  refresh();
  const timer = setInterval(refresh, REFRESH_MS);
  return () => clearInterval(timer);
}
