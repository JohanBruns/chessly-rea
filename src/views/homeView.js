// Startseite: „Hallo, <Name>“, Level-Pille, XP der letzten 7 Tage, aktueller Kurs mit dem Kapitel
// der nächsten Kachel und dessen Lernpfad, Karten für Wiederholen und Drill Shuffle.
import { findCourse, lineStats, loadAllCourses } from '../courses.js';
import { add, clear, fill, h } from '../dom.js';
import { courseProgress, levelInfo, nextTile, xpLastDays } from '../progress.js';
import { loadProgress, loadSettings, loadState, loadXp } from '../storage.js';
import { courseIcon } from '../ui/courseIcon.js';
import { icon } from '../ui/icons.js';
import { studyBlock, tileHref } from '../ui/studyBlock.js';
import { xpChart } from '../ui/xpChart.js';

export function levelPill(totalXp) {
  const info = levelInfo(totalXp);
  const pct = Math.round((info.intoLevel / info.span) * 100);
  return h(
    'div',
    { class: 'level-pill', title: `${info.intoLevel} / ${info.span} XP bis Level ${info.level + 1}` },
    h('span', { class: 'level-num' }, `LVL ${info.level}`),
    h('span', { class: 'level-xp' }, `${totalXp} XP`),
    h('span', { class: 'level-ring', style: { '--pct': pct } }, icon('star', { size: 14 })),
  );
}

export function currentCourse(courses, state) {
  return (state.lastCourse && findCourse(state.lastCourse)) || courses[0] || null;
}

function courseCard(course, progress, state) {
  const next = nextTile(course, progress, state);
  let chapterIndex = next ? next.chapter.index : course.chapters.length - 1;
  const pct = courseProgress(course, progress, state).percent;

  const chapterEl = h('div', { class: 'chapter-box' });
  const prevBtn = h('button', { class: 'icon-btn chapter-arrow', 'aria-label': 'Vorheriges Kapitel', onclick: () => show(chapterIndex - 1) }, icon('chevronLeft'));
  const nextBtn = h('button', { class: 'icon-btn chapter-arrow', 'aria-label': 'Nächstes Kapitel', onclick: () => show(chapterIndex + 1) }, icon('chevronRight'));

  function show(index) {
    chapterIndex = Math.max(0, Math.min(course.chapters.length - 1, index));
    const chapter = course.chapters[chapterIndex];
    prevBtn.disabled = chapterIndex === 0;
    nextBtn.disabled = chapterIndex === course.chapters.length - 1;
    const p = loadProgress();
    const s = loadState();
    fill(
      chapterEl,
      h('header', { class: 'chapter-box-head' }, h('div', { class: 'chapter-kicker' }, `KAPITEL ${chapter.index + 1}`), h('div', { class: 'chapter-box-title' }, chapter.title)),
      ...chapter.studies.map((study) => studyBlock(course, study, { progress: p, state: s, currentTileId: next?.tile.id, onChange: () => show(chapterIndex) })),
    );
  }
  show(chapterIndex);

  return h(
    'section',
    { class: 'card current-course' },
    h(
      'div',
      { class: 'current-head' },
      courseIcon(course, { size: 52 }),
      h(
        'div',
        { class: 'current-title' },
        h('a', { href: `#/course/${encodeURIComponent(course.id)}` }, course.name),
        h('div', { class: 'mini-progress' }, h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: { width: `${pct}%` } })), h('span', { class: 'muted small' }, `${pct}%`)),
      ),
      next
        ? h('a', { class: 'btn btn-primary', href: tileHref(course, next.tile) }, icon('play', { size: 16 }), state.started[course.id] ? 'Weiter lernen' : 'Kurs starten')
        : h('span', { class: 'done-pill' }, icon('check', { size: 16, strokeWidth: 3 }), 'Kurs abgeschlossen'),
    ),
    h('div', { class: 'chapter-carousel' }, prevBtn, chapterEl, nextBtn),
  );
}

export function renderHome(root) {
  const { courses, errors } = loadAllCourses();
  const settings = loadSettings();
  const progress = loadProgress();
  const state = loadState();
  const xp = loadXp();
  const days = xpLastDays(xp.byDay);
  const weekXp = days.reduce((sum, d) => sum + d.xp, 0);
  const due = lineStats(
    courses.flatMap((c) => c.lines),
    progress,
  ).due;
  const course = currentCourse(courses, state);

  add(
    root,
    h(
      'div',
      { class: 'home-grid' },
      h(
        'div',
        { class: 'home-left' },
        h(
          'section',
          { class: 'card greet-card' },
          h('h1', {}, `Hallo, ${settings.name}`),
          levelPill(xp.total),
          h('div', { class: 'chart-card' }, h('div', { class: 'chart-head' }, h('span', {}, 'XP der letzten 7 Tage'), h('strong', {}, `${weekXp} XP`)), xpChart(days)),
        ),
        h(
          'a',
          { class: ['card', 'action-card', due ? 'has-due' : ''], href: '#/review' },
          h('span', { class: 'action-icon' }, icon('repeat', { size: 22 })),
          h('div', {}, h('strong', {}, 'Wiederholen'), h('span', { class: 'muted small' }, due ? `${due} Variante${due === 1 ? '' : 'n'} fällig` : 'Nichts fällig – gut gemacht!')),
          due ? h('span', { class: 'count-badge' }, String(due)) : icon('check', { size: 20, cls: 'muted' }),
        ),
        h(
          'a',
          { class: 'card action-card', href: '#/drill' },
          h('span', { class: 'action-icon' }, icon('shuffle', { size: 22 })),
          h('div', {}, h('strong', {}, 'Drill Shuffle'), h('span', { class: 'muted small' }, 'Varianten zufällig gemischt')),
          icon('chevronRight', { size: 20, cls: 'muted' }),
        ),
      ),
      h(
        'div',
        { class: 'home-right' },
        errors.length
          ? h(
              'div',
              { class: 'card error-box' },
              h('strong', {}, 'Einige Kurse konnten nicht geladen werden:'),
              h(
                'ul',
                {},
                errors.map((e) => h('li', {}, e)),
              ),
            )
          : null,
        course
          ? courseCard(course, progress, state)
          : h('section', { class: 'card empty-state' }, h('h2', {}, 'Noch kein Kurs'), h('a', { class: 'btn btn-primary', href: '#/import' }, 'Eröffnung hinzufügen')),
        h('a', { class: 'link-accent all-courses', href: '#/courses' }, 'Alle Kurse ansehen', icon('chevronRight', { size: 16 })),
      ),
    ),
  );
  return null;
}
