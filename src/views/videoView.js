// Video einer Study direkt in der App abspielen (auch in der installierten iPhone-App,
// wo ein neuer Tab die Anmeldung verlieren würde).
import { findCourse } from '../courses.js';
import { add, h } from '../dom.js';
import { nextTile, tileStates, XP } from '../progress.js';
import { addXp, loadProgress, loadState, markVideoWatched } from '../storage.js';
import { setSessionHeader } from '../ui/layout.js';
import { tileHref, videoHref } from '../ui/studyBlock.js';
import { sessionHeader } from './tileView.js';

export function renderVideo(root, { courseId, studyId }) {
  const course = findCourse(courseId);
  const study = course?.studies.find((s) => s.id === studyId);
  if (!study?.video) {
    add(root, h('div', { class: 'card empty-state' }, h('h2', {}, 'Video nicht gefunden'), h('a', { class: 'btn btn-primary', href: '#/courses' }, 'Zu den Kursen')));
    return null;
  }
  const chapter = course.chapters.find((c) => c.id === study.chapterId);
  const backHref = `#/course/${encodeURIComponent(course.id)}?study=${encodeURIComponent(study.id)}`;
  setSessionHeader(sessionHeader(course, chapter));

  if (!loadState().videos[study.id]) addXp(XP.video);
  markVideoWatched(study.id);

  const firstTile = tileStates(study, loadProgress(), loadState()).find((e) => e.tile.type !== 'video' && e.status === 'available');
  const next = firstTile || nextTile(course, loadProgress(), loadState());

  const video = h('video', { class: 'study-video', src: videoHref(study.video), controls: true, playsinline: true, preload: 'metadata' });
  const errorEl = h('p', { class: 'muted video-error', hidden: true }, 'Das Video konnte nicht geladen werden. Ist es hochgeladen und bist du angemeldet?');
  video.addEventListener('error', () => (errorEl.hidden = false));

  add(
    root,
    h(
      'div',
      { class: 'video-page' },
      h('h1', {}, study.title),
      video,
      errorEl,
      h(
        'div',
        { class: 'row video-actions' },
        h('a', { class: 'btn', href: backHref }, 'Zurück zum Pfad'),
        next ? h('a', { class: 'btn btn-primary', href: tileHref(course, next.tile) }, 'Weiter zur Lern-Kachel') : null,
      ),
    ),
  );
  // Beim Verlassen der Ansicht das Laden abbrechen, sonst lädt Safari im Hintergrund weiter
  return () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
  };
}
