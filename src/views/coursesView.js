// Kursübersicht: Suche, Filter-Chips (Alle/Weiß/Schwarz/Importiert), Kurskarten mit Icon und Fortschritt.
import { loadAllCourses } from '../courses.js';
import { missingChesslyCourses } from '../chesslyCatalog.js';
import { add, clear, colorLabel, fill, h } from '../dom.js';
import { courseProgress, courseStarted, nextTile } from '../progress.js';
import { loadProgress, loadState } from '../storage.js';
import { courseIcon } from '../ui/courseIcon.js';
import { icon } from '../ui/icons.js';
import { tileHref } from '../ui/studyBlock.js';

const FILTERS = [
  { id: 'all', label: 'Alle', test: () => true },
  { id: 'w', label: 'Weiß', test: (c) => c.color === 'w' || c.color === 'both' },
  { id: 'b', label: 'Schwarz', test: (c) => c.color === 'b' || c.color === 'both' },
  { id: 'video', label: 'Videokurse', test: (c) => c.videoOnly },
  { id: 'imported', label: 'Importiert', test: (c) => c.source === 'imported' },
];

export function filterCourses(courses, { filter = 'all', query = '' } = {}) {
  const f = FILTERS.find((x) => x.id === filter) || FILTERS[0];
  const q = query.trim().toLowerCase();
  return courses.filter((c) => f.test(c) && (!q || `${c.name} ${c.description} ${c.chapters.map((ch) => ch.title).join(' ')}`.toLowerCase().includes(q)));
}

export function renderCourses(root, params) {
  const { courses } = loadAllCourses();
  const missing = missingChesslyCourses(courses);
  const progress = loadProgress();
  const state = loadState();
  let filter = FILTERS.some((f) => f.id === params.filter) ? params.filter : 'all';
  let query = '';

  const chipsEl = h('div', { class: 'chips', role: 'tablist' });
  const gridEl = h('div', { class: 'course-grid' });
  const search = h('input', {
    type: 'search',
    class: 'input search-input',
    placeholder: 'Kurse durchsuchen …',
    'aria-label': 'Kurse durchsuchen',
    oninput: (e) => ((query = e.target.value), renderGrid()),
  });

  function renderChips() {
    fill(
      chipsEl,
      ...FILTERS.map((f) =>
        h(
          'button',
          { class: ['chip', f.id === filter ? 'active' : ''], role: 'tab', 'aria-selected': String(f.id === filter), onclick: () => ((filter = f.id), renderChips(), renderGrid()) },
          f.label,
          h('span', { class: 'chip-count' }, String(filterCourses(courses, { filter: f.id }).length)),
        ),
      ),
    );
  }

  function card(course) {
    const pct = courseProgress(course, progress, state).percent;
    const next = nextTile(course, progress, state);
    const started = courseStarted(course, progress, state);
    const href = `#/course/${encodeURIComponent(course.id)}`;
    return h(
      'article',
      { class: 'card course-card' },
      h(
        'a',
        { class: 'course-card-top', href },
        courseIcon(course, { size: 64 }),
        h(
          'div',
          {},
          h('h2', {}, course.name),
          h('div', { class: 'tags' }, h('span', { class: ['tag', `tag-${course.color}`] }, colorLabel(course.color)), course.source === 'imported' ? h('span', { class: 'tag' }, 'Importiert') : null),
        ),
      ),
      course.description ? h('p', { class: 'muted course-desc' }, course.description) : null,
      h(
        'div',
        { class: 'muted small' },
        course.videoOnly
          ? `${course.chapters.length} Kapitel · ${course.studies.length} Videos`
          : `${course.chapters.length} Kapitel · ${course.studies.length} Studies · ${course.lines.length} Varianten`,
      ),
      h('div', { class: 'mini-progress' }, h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: { width: `${pct}%` } })), h('span', { class: 'small' }, `${pct}%`)),
      h(
        'div',
        { class: 'row' },
        h('a', { class: 'btn btn-primary', href: next ? (started ? tileHref(course, next.tile) : href) : href }, started ? (next ? 'Weiter' : 'Ansehen') : 'Kurs starten'),
        h('a', { class: 'btn btn-ghost', href }, 'Details'),
      ),
    );
  }

  function renderGrid() {
    const list = filterCourses(courses, { filter, query });
    fill(gridEl, ...list.map(card));
    if (!list.length) add(gridEl, h('div', { class: 'card empty-state' }, h('p', { class: 'muted' }, 'Keine Kurse gefunden.')));
    add(
      gridEl,
      h(
        'a',
        { class: 'card course-card add-card', href: '#/import' },
        h('div', { class: 'add-icon' }, icon('plus', { size: 28 })),
        h('strong', {}, 'Eröffnung hinzufügen'),
        h('span', { class: 'muted small' }, 'PGN-Datei, Text oder Lichess-Studie'),
      ),
    );
  }

  add(
    root,
    h(
      'div',
      { class: 'page' },
      h(
        'div',
        { class: 'page-head' },
        h('div', { class: 'page-icon' }, icon('grid', { size: 26 })),
        h('div', {}, h('h1', {}, 'Alle Kurse'), h('p', { class: 'muted' }, 'Wähle ein Repertoire und arbeite dich Kachel für Kachel durch den Lernpfad.')),
      ),
      h('div', { class: 'toolbar' }, h('label', { class: 'search' }, icon('search', { size: 18 }), search), chipsEl),
      missing.length
        ? h(
            'a',
            { class: 'card catalog-banner', href: '#/chessly' },
            h('span', { class: 'catalog-banner-icon' }, icon('download', { size: 22 })),
            h(
              'div',
              {},
              h('strong', {}, `${missing.length} Chessly-Kurse fehlen noch`),
              h('span', { class: 'muted small' }, 'Alle ansehen und selbst hinzufügen.'),
            ),
            icon('chevronRight', { size: 20, cls: 'muted' }),
          )
        : null,
      gridEl,
    ),
  );
  renderChips();
  renderGrid();
  return null;
}
