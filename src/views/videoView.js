// Video einer Study direkt in der App abspielen (auch in der installierten iPhone-App,
// wo ein neuer Tab die Anmeldung verlieren würde).
import { findCourse } from '../courses.js';
import { add, fill, h, progressBar } from '../dom.js';
import { activeDownload, canSaveOffline, deleteVideo, downloadErrorMessage, formatBytes, playbackSrc, savedVideoSize, saveVideo } from '../offlineVideos.js';
import { nextTile, tileStates, XP } from '../progress.js';
import { addXp, loadProgress, loadState, markVideoWatched } from '../storage.js';
import { icon } from '../ui/icons.js';
import { setSessionHeader } from '../ui/layout.js';
import { tileHref } from '../ui/studyBlock.js';
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

  const video = h('video', { class: 'study-video', controls: true, playsinline: true, preload: 'metadata' });
  const errorEl = h('p', { class: 'muted video-error', hidden: true });
  let saved = false;
  video.addEventListener('error', () => {
    if (!video.getAttribute('src')) return;
    errorEl.textContent =
      navigator.onLine === false && !saved
        ? 'Du bist offline und dieses Video ist nicht gespeichert.'
        : 'Das Video konnte nicht geladen werden. Bist du online und angemeldet? Ohne Internet laufen nur gespeicherte Videos.';
    errorEl.hidden = false;
  });

  // Quelle erst setzen, wenn klar ist, ob das Video offline gespeichert ist
  const setSource = (keepPosition = false) => {
    const time = video.currentTime;
    errorEl.hidden = true;
    video.src = playbackSrc(study.video, saved);
    if (keepPosition && time) video.addEventListener('loadedmetadata', () => (video.currentTime = time), { once: true });
  };
  const offline = canSaveOffline(study.video)
    ? offlineBox(study, course, (isNowSaved) => {
        const changed = saved !== isNowSaved;
        saved = isNowSaved;
        // Läuft das Video gerade, nicht dazwischenfunken – beim nächsten Öffnen kommt es aus dem Speicher
        if (!video.getAttribute('src') || (changed && video.paused)) setSource(true);
      })
    : null;
  if (!offline) setSource();

  add(
    root,
    h(
      'div',
      { class: 'video-page' },
      h('h1', {}, study.title),
      video,
      errorEl,
      offline?.el,
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
    offline?.dispose();
    video.pause();
    video.removeAttribute('src');
    video.load();
  };
}

// Kasten unter dem Video: „Offline speichern“ → Fortschritt → „Gespeichert“ mit Löschen.
// onSaved(bool) meldet, ob das Video gerade gespeichert ist (auch einmal direkt beim Start).
function offlineBox(study, course, onSaved) {
  const el = h('div', { class: 'card offline-box' });
  let unsubscribe = null;
  let disposed = false;

  const meta = { title: study.title, courseId: course.id, courseName: course.name };
  const watch = (download) => {
    unsubscribe?.();
    const render = (loaded, total) => !disposed && showProgress(loaded, total, download);
    unsubscribe = download.subscribe(render);
    render(download.loaded, download.total);
    download.promise.then(
      (size) => {
        if (disposed) return;
        onSaved(true);
        showSaved(size);
      },
      (err) => {
        if (disposed) return;
        if (err?.name === 'AbortError') showIdle();
        else showIdle(downloadErrorMessage(err));
      },
    );
  };

  function start() {
    saveVideo(study.video, meta).catch(() => {});
    watch(activeDownload(study.video));
  }

  function showIdle(error = '') {
    fill(
      el,
      h('div', { class: 'offline-info' }, h('strong', {}, 'Offline ansehen'), h('span', { class: 'muted small' }, 'Lädt das ganze Video aufs Gerät, damit es auch ohne Internet läuft.')),
      h('button', { class: 'btn btn-sm', onclick: start }, icon('download', { size: 16 }), error ? 'Erneut versuchen' : 'Offline speichern'),
      error ? h('p', { class: 'feedback-msg bad offline-error', role: 'alert' }, error) : null,
    );
  }

  function showProgress(loaded, total, download) {
    const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : null;
    fill(
      el,
      h(
        'div',
        { class: 'offline-info' },
        h('strong', {}, pct === null ? 'Wird gespeichert …' : `Wird gespeichert … ${pct} %`),
        h('span', { class: 'muted small' }, total ? `${formatBytes(loaded)} von ${formatBytes(total)}` : formatBytes(loaded)),
        progressBar(total ? loaded : 0, total || 1, 'offline-progress'),
      ),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => download.cancel() }, icon('close', { size: 16 }), 'Abbrechen'),
    );
  }

  function showSaved(size) {
    fill(
      el,
      h(
        'div',
        { class: 'offline-info' },
        h('strong', { class: 'offline-saved' }, icon('check', { size: 18 }), 'Gespeichert'),
        h('span', { class: 'muted small' }, size ? `${formatBytes(size)} · läuft auch offline` : 'Läuft auch offline'),
      ),
      h(
        'button',
        {
          class: 'btn btn-danger btn-sm',
          onclick: async () => {
            await deleteVideo(study.video);
            onSaved(false);
            showIdle();
          },
        },
        icon('trash', { size: 16 }),
        'Löschen',
      ),
    );
  }

  const running = activeDownload(study.video);
  if (running) {
    onSaved(false);
    watch(running);
  } else {
    savedVideoSize(study.video)
      .then((size) => {
        if (disposed) return;
        onSaved(size !== null);
        if (size === null) showIdle();
        else showSaved(size);
      })
      .catch(() => {
        onSaved(false);
        showIdle();
      });
  }

  return {
    el,
    dispose() {
      disposed = true;
      unsubscribe?.();
    },
  };
}
