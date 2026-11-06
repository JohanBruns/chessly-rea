// Merkliste für Chessly-Kurse: Wer einen Kurs hinzufügt, merkt ihn damit vor. Beim nächsten Öffnen
// prüft die App, ob er inzwischen da ist, und meldet das (mit erteilter Erlaubnis auch als Benachrichtigung).
import { catalogCourse, findOwnedCourse, loadChesslyCatalog } from './chesslyCatalog.js';
import { loadWatchlist, saveWatchlist } from './storage.js';
import { toast } from './ui/toast.js';

function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function sendNotification(title, body, tag) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const options = { body, tag, icon: '/icons/icon192.png', badge: '/icons/icon192.png' };
  const fallback = () => {
    try {
      new Notification(title, options);
    } catch {
      // Manche Browser erlauben nur die Anzeige über den Service Worker.
    }
  };
  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready
      .then((registration) => registration.showNotification(title, options))
      .catch(fallback);
  } else {
    fallback();
  }
}

export function watchCourse(course) {
  const watch = loadWatchlist();
  watch[course.id] = {
    name: course.name,
    since: Date.now(),
    comingSoon: Boolean(course.comingSoon),
    videosDownloaded: Boolean(course.videosDownloaded),
  };
  saveWatchlist(watch);
}

/**
 * Reine Prüfung (ohne Speichern/Benachrichtigen): Welche vorgemerkten Kurse sind
 * inzwischen in der App, bei Chessly erschienen oder als Video heruntergeladen?
 */
export function pendingWatchNotifications(watch, courses, catalog = loadChesslyCatalog()) {
  const changes = [];
  for (const [id, entry] of Object.entries(watch)) {
    if (entry.notifiedAt) continue;
    const inApp = findOwnedCourse({ id, name: entry.name }, courses);
    const current = catalogCourse(catalog, id);
    const released = Boolean(entry.comingSoon && current && !current.comingSoon);
    const downloaded = entry.videosDownloaded === false && Boolean(current && current.videosDownloaded);
    if (!inApp && !released && !downloaded) continue;
    changes.push({ id, ...entry, inApp: Boolean(inApp), released, downloaded });
  }
  return changes;
}

export function checkWatchedCourses(courses, { catalog = loadChesslyCatalog(), notify = true } = {}) {
  const watch = loadWatchlist();
  const changes = pendingWatchNotifications(watch, courses, catalog);
  if (!changes.length) return changes;
  for (const entry of changes) watch[entry.id].notifiedAt = Date.now();
  saveWatchlist(watch);
  if (notify) {
    for (const entry of changes) {
      const message = entry.inApp
        ? `${entry.name} ist jetzt in deiner App.`
        : entry.downloaded
          ? `Die Videos zu ${entry.name} sind heruntergeladen.`
          : `${entry.name} ist bei Chessly jetzt verfügbar.`;
      toast(message, { iconName: 'bell', duration: 5000 });
      sendNotification('Chessly-Kurs', message, `chessly-watch-${entry.id}`);
    }
  }
  return changes;
}
