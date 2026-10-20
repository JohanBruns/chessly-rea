// Spaced-Repetition-Wiederholung: alle fälligen Varianten (eines Kurses oder aller Kurse).
import { buildQueue, findCourse, lineStats, loadAllCourses } from '../courses.js';
import { add, formatDue, h } from '../dom.js';
import { XP } from '../progress.js';
import { loadProgress } from '../storage.js';
import { icon } from '../ui/icons.js';
import { setSessionHeader } from '../ui/layout.js';
import { runSession } from './sessionCore.js';
import { sessionHeader } from './tileView.js';

function nextDue(lines, progress) {
  const dues = lines.map((l) => progress[l.id]).filter((c) => c && c.status !== 'new' && c.due > Date.now());
  if (!dues.length) return null;
  return dues.reduce((a, b) => (a.due < b.due ? a : b));
}

export function renderReview(root, params) {
  const course = params.course ? findCourse(params.course) : null;
  const lines = course ? course.lines : loadAllCourses().courses.flatMap((c) => c.lines);
  const progress = loadProgress();
  const queue = buildQueue(lines, 'review', progress);
  const backHref = course ? `#/course/${encodeURIComponent(course.id)}` : '#/';

  if (!queue.length) {
    const stats = lineStats(lines, progress);
    const upcoming = nextDue(lines, progress);
    add(
      root,
      h(
        'div',
        { class: 'page narrow' },
        h(
          'section',
          { class: 'card empty-state' },
          h('div', { class: 'empty-icon' }, icon('repeat', { size: 36 })),
          h('h1', {}, 'Nichts fällig'),
          h(
            'p',
            { class: 'muted' },
            stats.learned
              ? `Alle ${stats.learned} gelernten Varianten sitzen. ${upcoming ? `Nächste Wiederholung ${formatDue(upcoming)}.` : ''}`
              : 'Lerne zuerst ein paar Varianten im Lernpfad – sie tauchen danach hier in wachsenden Abständen wieder auf.',
          ),
          h(
            'div',
            { class: 'row center' },
            h('a', { class: 'btn btn-primary', href: course ? `#/drill?course=${encodeURIComponent(course.id)}` : '#/drill' }, icon('shuffle', { size: 18 }), 'Drill Shuffle'),
            h('a', { class: 'btn btn-ghost', href: backHref }, 'Zurück'),
          ),
        ),
      ),
    );
    return null;
  }

  setSessionHeader(
    course
      ? sessionHeader(course, null)
      : h(
          'a',
          { class: 'session-head', href: '#/' },
          h('span', { class: 'session-icon' }, icon('repeat', { size: 24 })),
          h('div', {}, h('div', { class: 'session-course' }, 'Wiederholung'), h('div', { class: 'session-chapter muted' }, 'Fällige Varianten aus allen Kursen')),
        ),
  );

  return runSession(root, {
    lines: queue.map((q) => q.line),
    kind: 'drill',
    bannerIcon: 'repeat',
    title: (run, step) => `Wiederholung · ${step.variation + 1} von ${run.variationCount}`,
    grade: true,
    xpPerVariation: XP.review,
    backHref,
    backLabel: course ? 'Zurück zum Kurs' : 'Zur Startseite',
    onFinish: (run) => ({
      title: 'Wiederholung geschafft!',
      text: `${run.variationCount} fällige Variante${run.variationCount === 1 ? '' : 'n'} wiederholt. Fehlerhafte Varianten kommen bald noch einmal dran.`,
      actions: [{ label: course ? 'Zurück zum Kurs' : 'Zur Startseite', href: backHref, primary: true }],
    }),
  });
}
