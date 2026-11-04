// Kursseite: Kopf (Icon, Titel, Kurs-Explorer, Beschreibung, Fortschritt), Kapitel als Akkordeon
// mit Studies und Lernpfaden, Seitenleiste mit Bot, Drill Shuffle und Wiederholen.
import { findCourse, lineStats, loadAllCourses } from '../courses.js';
import { add, clear, colorLabel, fill, h } from '../dom.js';
import { countsTile, courseProgress, courseStarted, nextTile, tileStates } from '../progress.js';
import { isChapterOpen, loadProgress, loadState, removeImportedCourse, setChapterOpen } from '../storage.js';
import { courseIcon } from '../ui/courseIcon.js';
import { icon } from '../ui/icons.js';
import { studyBlock, tileHref } from '../ui/studyBlock.js';
import { openCourseExplorer } from './courseExplorer.js';

function chapterStats(course, chapter, progress, state) {
  let total = 0;
  let done = 0;
  for (const study of chapter.studies) {
    for (const { tile, status } of tileStates(study, progress, state)) {
      if (!countsTile(course, tile)) continue;
      total++;
      if (status === 'completed') done++;
    }
  }
  return { total, done };
}

export function renderCourse(root, { id, params = {} }) {
  const course = findCourse(id);
  if (!course) {
    add(root, h('div', { class: 'card empty-state' }, h('h2', {}, 'Kurs nicht gefunden'), h('a', { class: 'btn btn-primary', href: '#/courses' }, 'Zu den Kursen')));
    return null;
  }
  const chaptersEl = h('div', { class: 'chapters' });
  const headEl = h('section', { class: 'card course-hero' });
  const sideEl = h('aside', { class: 'course-side' });

  function render() {
    const progress = loadProgress();
    const state = loadState();
    const pct = courseProgress(course, progress, state);
    const next = nextTile(course, progress, state);
    const stats = lineStats(course.lines, progress);
    const focusStudy = params.study ? course.studies.find((s) => s.id === params.study) : null;
    const focusChapterId = focusStudy?.chapterId || next?.chapter.id || course.chapters[0].id;

    fill(
      headEl,
      h(
        'div',
        { class: 'hero-top' },
        courseIcon(course, { size: 76 }),
        h(
          'div',
          { class: 'hero-title' },
          h('h1', {}, course.name),
          h(
            'div',
            { class: 'tags' },
            h('span', { class: ['tag', `tag-${course.color}`] }, colorLabel(course.color)),
            h('span', { class: 'tag' }, `${course.chapters.length} Kapitel`),
            h('span', { class: 'tag' }, course.videoOnly ? `${course.studies.length} Videos` : `${course.lines.length} Varianten`),
          ),
        ),
        // Ohne Linien gibt es im Video-Kurs nichts zu erkunden
        course.videoOnly ? null : h('button', { class: 'btn btn-ghost explorer-btn', onclick: () => openCourseExplorer(course) }, icon('compass', { size: 18 }), 'Kurs-Explorer'),
      ),
      course.description ? h('p', { class: 'muted' }, course.description) : null,
      h(
        'div',
        { class: 'hero-progress' },
        h('div', { class: 'progress big' }, h('div', { class: 'progress-fill', style: { width: `${pct.percent}%` } })),
        h('span', {}, h('strong', {}, `${pct.percent}%`), h('span', { class: 'muted' }, ` · ${pct.done} / ${pct.total} ${course.videoOnly ? 'Videos' : 'Kacheln'}`)),
        next
          ? h('a', { class: 'btn btn-primary', href: tileHref(course, next.tile) }, icon('play', { size: 16 }), courseStarted(course, progress, loadState()) ? (course.videoOnly ? 'Weiter ansehen' : 'Weiter lernen') : course.videoOnly ? 'Kurs ansehen' : 'Kurs starten')
          : null,
      ),
    );

    fill(
      chaptersEl,
      ...course.chapters.map((chapter) => {
        const cs = chapterStats(course, chapter, progress, state);
        const open = isChapterOpen(chapter.id, chapter.id === focusChapterId);
        const details = h(
          'details',
          { class: 'chapter-acc', open, 'data-chapter': chapter.id },
          h(
            'summary',
            { class: 'chapter-summary' },
            h('span', { class: ['chapter-num', cs.done === cs.total ? 'done' : ''] }, cs.done === cs.total ? icon('check', { size: 16, strokeWidth: 3 }) : String(chapter.index + 1)),
            h('div', { class: 'chapter-text' }, h('div', { class: 'chapter-kicker' }, `KAPITEL ${chapter.index + 1}`), h('div', { class: 'chapter-name' }, chapter.title)),
            h('span', { class: 'muted small chapter-count' }, `${cs.done}/${cs.total}`),
            icon('chevronDown', { size: 20, cls: 'chev' }),
          ),
          h(
            'div',
            { class: 'chapter-content' },
            chapter.description ? h('p', { class: 'muted chapter-desc' }, chapter.description) : null,
            chapter.studies.map((study) => studyBlock(course, study, { progress, state, currentTileId: next?.tile.id, onChange: render })),
          ),
        );
        details.addEventListener('toggle', () => setChapterOpen(chapter.id, details.open));
        return details;
      }),
    );

    fill(
      sideEl,
      h(
        'a',
        { class: 'card side-card', href: `#/bot?course=${encodeURIComponent(course.id)}` },
        h('span', { class: 'side-icon bot' }, icon('bot', { size: 26 })),
        h('div', {}, h('strong', {}, 'Gegen den Bot'), h('span', { class: 'muted small' }, 'Spiele deine Eröffnung gegen den Computer')),
      ),
      h(
        'a',
        { class: 'card side-card', href: `#/drill?course=${encodeURIComponent(course.id)}` },
        h('span', { class: 'side-icon shuffle' }, icon('shuffle', { size: 26 })),
        h('div', {}, h('strong', {}, 'Drill Shuffle'), h('span', { class: 'muted small' }, 'Varianten zufällig gemischt abfragen')),
      ),
      h(
        'a',
        { class: ['card', 'side-card', stats.due ? 'has-due' : ''], href: `#/review?course=${encodeURIComponent(course.id)}` },
        h('span', { class: 'side-icon review' }, icon('repeat', { size: 26 })),
        h(
          'div',
          {},
          h('strong', {}, 'Wiederholen'),
          h('span', { class: 'muted small' }, stats.due ? `${stats.due} Variante${stats.due === 1 ? '' : 'n'} fällig` : `${stats.learned} gelernt · nichts fällig`),
        ),
        stats.due ? h('span', { class: 'count-badge' }, String(stats.due)) : null,
      ),
      course.source === 'imported'
        ? h(
            'button',
            {
              class: 'btn btn-danger btn-sm',
              onclick: () => {
                if (!confirm(`Importierten Kurs „${course.name}“ löschen? Der Lernstand bleibt erhalten, falls du ihn erneut importierst.`)) return;
                removeImportedCourse(course.id);
                loadAllCourses({ refresh: true });
                location.hash = '#/courses';
              },
            },
            icon('trash', { size: 16 }),
            'Kurs löschen',
          )
        : null,
    );
  }

  // Bot, Drill und Wiederholen brauchen Linien – im Video-Kurs fällt die Seitenleiste weg
  add(root, h('div', { class: ['course-layout', course.videoOnly ? 'video-only' : ''] }, h('div', { class: 'course-main' }, headEl, chaptersEl), course.videoOnly ? null : sideEl));
  render();

  if (params.study) {
    const el = root.querySelector(`[data-study="${CSS.escape(params.study)}"]`);
    if (el) {
      el.closest('details')?.setAttribute('open', '');
      requestAnimationFrame(() => el.scrollIntoView({ block: 'center' }));
    }
  }
  return null;
}
