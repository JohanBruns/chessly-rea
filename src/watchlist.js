// Merkliste für Chessly-Kurse: Kurs vormerken, Benachrichtigung erlauben und beim
// nächsten Öffnen prüfen, ob ein vorgemerkter Kurs inzwischen da oder heruntergeladen ist.
import { catalogCourse, findOwnedCourse, loadChesslyCatalog } from './chesslyCatalog.js';
import { loadWatchlist, saveWatchlist } from './storage.js';
import { toast } from './ui/toast.js';

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotifications() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
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

export function toggleWatch(course) {
  const watch = loadWatchlist();
  if (watch[course.id]) {
    delete watch[course.id];
    saveWatchlist(watch);
    return false;
  }
  watch[course.id] = {
    name: course.name,
    since: Date.now(),
    comingSoon: Boolean(course.comingSoon),
    videosDownloaded: Boolean(course.videosDownloaded),
  };
  saveWatchlist(watch);
  return true;
}

export function activeWatchCount(watch = loadWatchlist()) {
  return Object.values(watch).filter((entry) => !entry.notifiedAt).length;
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
