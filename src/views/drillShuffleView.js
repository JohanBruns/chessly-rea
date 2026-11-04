// Drill Shuffle: Kurs wählen, dann Varianten in zufälliger Reihenfolge aus dem Gedächtnis spielen.
import { findCourse, lineStats, loadAllCourses } from '../courses.js';
import { add, h } from '../dom.js';
import { XP } from '../progress.js';
import { isNew } from '../scheduler.js';
import { loadProgress } from '../storage.js';
import { shuffle } from '../tileSession.js';
import { courseIcon } from '../ui/courseIcon.js';
import { icon } from '../ui/icons.js';
import { setSessionHeader } from '../ui/layout.js';
import { runSession } from './sessionCore.js';
import { sessionHeader } from './tileView.js';

const SIZES = [5, 10, 20];

// Gelernte Varianten bevorzugen; ohne gelernte Varianten alle verwenden
export function shufflePool(course, progress) {
  const learned = course.lines.filter((l) => !isNew(progress[l.id]));
  return { pool: learned.length ? learned : course.lines, learnedOnly: learned.length > 0 };
}

function picker(root) {
  // Video-Kurse haben keine Varianten zum Abfragen
  const courses = loadAllCourses().courses.filter((course) => !course.videoOnly);
  const progress = loadProgress();
  let size = 10;
  const sizeChips = h('div', { class: 'chips' });
  const renderChips = () =>
    sizeChips.replaceChildren(
      ...SIZES.map((n) =>
        h(
          'button',
          {
            class: ['chip', n === size ? 'active' : ''],
            onclick: () => {
              size = n;
              renderChips();
              root.querySelectorAll('[data-course]').forEach((a) => (a.href = `#/drill?course=${encodeURIComponent(a.dataset.course)}&n=${size}`));
            },
          },
          `${n} Varianten`,
        ),
      ),
    );
  renderChips();

  add(
    root,
    h(
      'div',
      { class: 'page' },
      h(
        'div',
        { class: 'page-head' },
        h('div', { class: 'page-icon' }, icon('shuffle', { size: 28 })),
        h('div', {}, h('h1', {}, 'Drill Shuffle'), h('p', { class: 'muted' }, 'Wähle einen Kurs – die Varianten kommen in zufälliger Reihenfolge, ganz ohne Hilfen.')),
      ),
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Länge:'), sizeChips),
      h(
        'div',
        { class: 'pick-grid' },
        courses.map((course) => {
          const stats = lineStats(course.lines, progress);
          return h(
            'a',
            { class: 'card pick-card', href: `#/drill?course=${encodeURIComponent(course.id)}&n=${size}`, 'data-course': course.id },
            courseIcon(course, { size: 52 }),
            h(
              'div',
              { class: 'pick-info' },
              h('strong', {}, course.name),
              h('span', { class: 'muted small' }, stats.learned ? `${stats.learned} gelernte Varianten` : `${course.lines.length} Varianten (noch keine gelernt)`),
            ),
            icon('chevronRight', { size: 20, cls: 'muted' }),
          );
        }),
      ),
    ),
  );
  return null;
}

export function renderDrillShuffle(root, params) {
  if (!params.course) return picker(root);
  const course = findCourse(params.course);
  if (!course) return picker(root);
  const size = Number(params.n) || 10;
  const { pool } = shufflePool(course, loadProgress());
  const lines = shuffle(pool).slice(0, size);
  const backHref = `#/course/${encodeURIComponent(course.id)}`;

  setSessionHeader(sessionHeader(course, null));
  return runSession(root, {
    lines,
    kind: 'drill',
    bannerIcon: 'shuffle',
    title: (run, step) => `Drill Shuffle · ${step.variation + 1} von ${run.variationCount}`,
    grade: false,
    xpPerVariation: XP.review,
    backHref,
    backLabel: 'Zurück zum Kurs',
    onFinish: () => ({
      title: 'Drill Shuffle geschafft!',
      text: 'Noch eine Runde? Jede Runde wird neu gemischt.',
      actions: [
        { label: 'Neu mischen', href: `#/drill?course=${encodeURIComponent(course.id)}&n=${size}&r=${Date.now()}`, primary: true },
        { label: 'Zurück zum Kurs', href: backHref },
      ],
    }),
  });
}
