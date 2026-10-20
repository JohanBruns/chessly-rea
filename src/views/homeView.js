// Startseite: alle Kurse mit Lernstand, globaler Button für fällige Wiederholungen.
import { lineStats, loadAllCourses } from '../courses.js';
import { h, colorLabel, progressBar } from '../dom.js';
import { loadProgress } from '../storage.js';

export function courseActions(course, stats, { chapter } = {}) {
  const base = `course=${encodeURIComponent(course.id)}${chapter ? `&chapter=${encodeURIComponent(chapter.id)}` : ''}`;
  return h(
    'div',
    { class: 'row' },
    h('a', { class: ['btn', 'btn-primary', stats.newCount ? '' : 'disabled'], href: `#/train?kind=learn&${base}` }, `Lernen (${stats.newCount} neu)`),
    h('a', { class: ['btn', stats.due ? 'btn-accent' : 'disabled'], href: `#/train?kind=review&${base}` }, `Wiederholen (${stats.due})`),
    h('a', { class: 'btn btn-ghost', href: `#/train?kind=practice&${base}` }, 'Frei üben'),
  );
}

export function statsLine(stats) {
  return h(
    'div',
    { class: 'stats' },
    h('span', {}, h('strong', {}, stats.learned), ` / ${stats.total} gelernt`),
    h('span', {}, h('strong', {}, stats.due), ' fällig'),
    h('span', {}, h('strong', {}, stats.mastered), ' sicher'),
  );
}

export function renderHome(root) {
  const { courses, errors } = loadAllCourses();
  const progress = loadProgress();
  const all = lineStats(
    courses.flatMap((c) => c.lines),
    progress,
  );

  root.append(
    h(
      'section',
      { class: 'hero card' },
      h('div', {}, h('h1', {}, 'Dein Eröffnungstrainer'), h('p', { class: 'muted' }, 'Lernen → aus dem Gedächtnis spielen → in wachsenden Abständen wiederholen.')),
      all.due
        ? h('a', { class: 'btn btn-accent btn-lg', href: '#/train?kind=review' }, `${all.due} Wiederholung${all.due === 1 ? '' : 'en'} fällig – los geht's`)
        : h('div', { class: 'muted' }, all.learned ? 'Heute ist nichts mehr fällig. 🎉' : 'Starte mit „Lernen“ in einem Kurs.'),
    ),
  );

  if (errors.length) {
    root.append(h('div', { class: 'card error-box' }, h('strong', {}, 'Einige Kurse konnten nicht geladen werden:'), h('ul', {}, errors.map((e) => h('li', {}, e)))));
  }

  root.append(
    h(
      'div',
      { class: 'course-grid' },
      courses.map((course) => {
        const stats = lineStats(course.lines, progress);
        return h(
          'article',
          { class: 'card course-card' },
          h('div', { class: 'course-head' }, h('a', { class: 'course-name', href: `#/course/${encodeURIComponent(course.id)}` }, course.name), h('span', { class: ['color-badge', course.color] }, colorLabel(course.color))),
          course.description ? h('p', { class: 'muted' }, course.description) : null,
          h('div', { class: 'muted small' }, `${course.chapters.length} Kapitel · ${course.lines.length} Linien${course.source === 'imported' ? ' · importiert' : ''}`),
          progressBar(stats.learned, stats.total),
          statsLine(stats),
          courseActions(course, stats),
        );
      }),
      h(
        'a',
        { class: 'card course-card add-card', href: '#/import' },
        h('div', { class: 'add-icon' }, '+'),
        h('div', {}, 'Eröffnung hinzufügen'),
        h('div', { class: 'muted small' }, 'PGN, Datei oder Lichess-Studie'),
      ),
    ),
  );
  return () => {};
}
