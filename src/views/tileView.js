// Kachel-Sitzung aus dem Lernpfad: Lern-Kachel (2 Varianten: Lernen + Wiederholen) oder Drill-Kachel.
import { findCourse } from '../courses.js';
import { add, h } from '../dom.js';
import { findTile, nextTile, tileStates, XP } from '../progress.js';
import { addXp, loadProgress, loadState, markDrillDone, touchCourse } from '../storage.js';
import { courseIcon } from '../ui/courseIcon.js';
import { setSessionHeader } from '../ui/layout.js';
import { tileHref } from '../ui/studyBlock.js';
import { xpToast } from '../ui/toast.js';
import { runSession } from './sessionCore.js';

export function sessionHeader(course, chapter) {
  return h(
    'a',
    { class: 'session-head', href: `#/course/${encodeURIComponent(course.id)}` },
    courseIcon(course, { size: 42 }),
    h(
      'div',
      {},
      h('div', { class: 'session-course' }, course.name),
      chapter ? h('div', { class: 'session-chapter' }, h('span', { class: 'muted' }, `Kapitel ${chapter.index + 1}`), ` ${chapter.title}`) : null,
    ),
  );
}

function notFound(root, text) {
  add(root, h('div', { class: 'card empty-state' }, h('h2', {}, text), h('a', { class: 'btn btn-primary', href: '#/courses' }, 'Zu den Kursen')));
}

export function renderTileSession(root, { courseId, tileId }) {
  const course = findCourse(courseId);
  const found = course && findTile(course, tileId);
  if (!found) return notFound(root, 'Kachel nicht gefunden');
  const { chapter, study, tile } = found;
  const backHref = `#/course/${encodeURIComponent(course.id)}?study=${encodeURIComponent(study.id)}`;

  const status = tileStates(study, loadProgress(), loadState()).find((e) => e.tile.id === tile.id)?.status;
  if (status === 'locked' || tile.type === 'video') {
    add(
      root,
      h(
        'div',
        { class: 'card empty-state' },
        h('h2', {}, 'Diese Kachel ist noch gesperrt'),
        h('p', { class: 'muted' }, 'Schließe zuerst die vorherigen Kacheln dieser Study ab.'),
        h('a', { class: 'btn btn-primary', href: backHref }, 'Zurück zum Pfad'),
      ),
    );
    return null;
  }

  touchCourse(course.id);
  setSessionHeader(sessionHeader(course, chapter));
  const isDrill = tile.type === 'drill';

  return runSession(root, {
    lines: tile.lines,
    kind: isDrill ? 'drill' : 'learn',
    bannerIcon: isDrill ? 'shuffle' : 'book',
    title: (run, step) => `${isDrill ? 'Drill · ' : ''}Variante ${step.variation + 1} von ${run.variationCount}`,
    grade: true,
    xpPerVariation: isDrill ? 0 : XP.variation,
    backHref,
    backLabel: 'Zurück zum Pfad',
    videoUrl: study.video,
    onFinish: () => {
      let xp = 0;
      if (isDrill) {
        if (!loadState().drills[study.id]) xp = XP.drillTile;
        markDrillDone(study.id);
        if (xp) {
          addXp(xp);
          xpToast(xp);
        }
      }
      const next = nextTile(course, loadProgress(), loadState());
      const actions = [{ label: 'Zurück zum Pfad', href: backHref, primary: !next }];
      if (next) actions.unshift({ label: 'Nächste Kachel', href: tileHref(course, next.tile), primary: true });
      return {
        xp,
        title: isDrill ? 'Drill abgeschlossen!' : 'Kachel abgeschlossen!',
        text: isDrill ? `„${study.title}“ ist abgeschlossen – alle Varianten sitzen.` : 'Die nächste Kachel im Pfad ist freigeschaltet.',
        actions,
      };
    },
  });
}
