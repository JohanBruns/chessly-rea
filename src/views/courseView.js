// Kursansicht: Kapitel mit ihren Linien und dem Lernstand jeder Linie.
import { findCourse, lineStats, loadAllCourses } from '../courses.js';
import { h, colorLabel, formatDue, progressBar } from '../dom.js';
import { isDue, isMastered } from '../scheduler.js';
import { loadProgress, removeImportedCourse, resetCourseProgress } from '../storage.js';
import { courseActions, statsLine } from './homeView.js';

function statusClass(card) {
  if (!card || card.status === 'new') return 'new';
  if (isDue(card)) return 'due';
  if (isMastered(card)) return 'mastered';
  return 'learning';
}

export function renderCourse(root, { id }) {
  const course = findCourse(id);
  if (!course) {
    root.append(h('div', { class: 'card empty-state' }, h('h2', {}, 'Kurs nicht gefunden'), h('a', { class: 'btn', href: '#/' }, 'Zur Startseite')));
    return () => {};
  }
  const progress = loadProgress();
  const stats = lineStats(course.lines, progress);

  const resetBtn = h(
    'button',
    {
      class: 'btn btn-ghost btn-sm',
      onclick: () => {
        if (!confirm(`Lernstand für „${course.name}“ wirklich zurücksetzen?`)) return;
        resetCourseProgress(course.id);
        location.reload();
      },
    },
    'Lernstand zurücksetzen',
  );
  const deleteBtn =
    course.source === 'imported'
      ? h(
          'button',
          {
            class: 'btn btn-danger btn-sm',
            onclick: () => {
              if (!confirm(`Importierten Kurs „${course.name}“ löschen? Der Lernstand bleibt erhalten, falls du ihn erneut importierst.`)) return;
              removeImportedCourse(course.id);
              loadAllCourses({ refresh: true });
              location.hash = '#/';
            },
          },
          'Kurs löschen',
        )
      : null;

  root.append(
    h('a', { class: 'link-muted', href: '#/' }, '← Alle Kurse'),
    h(
      'section',
      { class: 'card course-hero' },
      h('div', { class: 'course-head' }, h('h1', {}, course.name), h('span', { class: ['color-badge', course.color] }, colorLabel(course.color))),
      course.description ? h('p', { class: 'muted' }, course.description) : null,
      progressBar(stats.learned, stats.total),
      statsLine(stats),
      courseActions(course, stats),
      h('div', { class: 'row row-end' }, resetBtn, deleteBtn),
    ),
  );

  for (const chapter of course.chapters) {
    const cStats = lineStats(chapter.lines, progress);
    root.append(
      h(
        'section',
        { class: 'card chapter' },
        h('div', { class: 'chapter-head' }, h('h2', {}, chapter.title), h('span', { class: 'muted small' }, `${cStats.learned} / ${cStats.total} gelernt · ${colorLabel(chapter.userColor)}`)),
        chapter.description ? h('p', { class: 'muted' }, chapter.description) : null,
        courseActions(course, cStats, { chapter }),
        h(
          'ul',
          { class: 'line-list' },
          chapter.lines.map((line) => {
            const card = progress[line.id];
            const preview = line.moves
              .slice(0, 8)
              .map((n, i) => (n.color === 'w' || i === 0 ? `${n.moveNumber}.${n.color === 'b' ? '..' : ''}${n.san}` : n.san))
              .join(' ');
            return h(
              'li',
              { class: 'line-item' },
              h('span', { class: ['status-dot', statusClass(card)], title: formatDue(card) }),
              h('div', { class: 'line-info' }, h('div', { class: 'line-name' }, line.name), h('div', { class: 'line-moves' }, preview + (line.moves.length > 8 ? ' …' : ''))),
              h('span', { class: 'line-due small muted' }, formatDue(card)),
              h(
                'div',
                { class: 'line-buttons' },
                h('a', { class: 'btn btn-sm btn-ghost', href: `#/train?line=${encodeURIComponent(line.id)}&mode=learn&course=${encodeURIComponent(course.id)}` }, 'Lernen'),
                h('a', { class: 'btn btn-sm', href: `#/train?line=${encodeURIComponent(line.id)}&mode=drill&course=${encodeURIComponent(course.id)}` }, 'Drillen'),
              ),
            );
          }),
        ),
      ),
    );
  }
  return () => {};
}
