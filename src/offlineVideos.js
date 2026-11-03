// Kursvideos offline speichern: lädt das komplette Video und legt es in einem eigenen Cache ab.
// Der Service Worker (public/sw.js) spielt es von dort ab – inklusive Range-Anfragen für Safari.
// Titel, Kurs und Datum stehen als X-Header in der gespeicherten Antwort, so braucht die Übersicht
// keine zweite Liste, die aus dem Takt geraten könnte.
import { videoHref } from './ui/studyBlock.js';

// Gleicher Name wie in public/sw.js
export const VIDEO_CACHE = 'chessly-rea-videos';
const OFFLINE_PARAM = 'offline';

// Laufende Downloads pro Video – sie laufen weiter, wenn man die Videoseite verlässt
const downloads = new Map();

export const offlineSupported = () => typeof caches !== 'undefined';

// Nur Videos von der eigenen Seite (R2 über /downloader/downloads/) lassen sich speichern
export function canSaveOffline(video) {
  if (!offlineSupported() || !video) return false;
  const url = new URL(videoHref(video), location.origin);
  return url.origin === location.origin && url.pathname.startsWith('/downloader/downloads/');
}

// Absolute URL ohne Query, unter der das Video im Cache liegt
export function cacheKey(video) {
  return new URL(videoHref(video), location.origin).href;
}

// Video-URL für das <video>-Element: gespeicherte Videos bekommen ?offline, damit der Service Worker sie ausliefert
export function playbackSrc(video, saved) {
  const src = videoHref(video);
  return saved ? `${src}${src.includes('?') ? '&' : '?'}${OFFLINE_PARAM}` : src;
}

// Größe des gespeicherten Videos in Bytes oder null, wenn es nicht gespeichert ist
export async function savedVideoSize(video) {
  if (!offlineSupported() || !(await caches.has(VIDEO_CACHE))) return null;
  const cache = await caches.open(VIDEO_CACHE);
  const response = await cache.match(cacheKey(video));
  return response ? Number(response.headers.get('Content-Length')) || 0 : null;
}

// Fehler beim Laden/Speichern in eine verständliche Meldung übersetzen
export function downloadErrorMessage(err) {
  if (err?.name === 'QuotaExceededError' || err?.code === 'quota')
    return 'Nicht genug Speicher auf dem Gerät. Lösche andere gespeicherte Videos in den Einstellungen oder gib Platz auf dem iPhone frei.';
  if (err?.name === 'AbortError') return 'Download abgebrochen.';
  if (err?.code === 'status') {
    if (err.status === 401 || err.status === 403) return 'Nicht angemeldet – öffne die App einmal online neu und versuche es dann noch einmal.';
    if (err.status === 404) return 'Das Video liegt nicht auf dem Server.';
    return `Der Server hat den Download abgelehnt (Status ${err.status}).`;
  }
  if (err?.code === 'incomplete') return 'Der Download wurde unterbrochen. Prüfe die Verbindung und versuche es erneut.';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Keine Internetverbindung – der Download wurde abgebrochen.';
  return 'Der Download ist fehlgeschlagen. Prüfe die Verbindung und versuche es erneut.';
}

const codedError = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const fmt = (value) => value.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: value < 10 ? 1 : 0 });
  if (bytes >= 1e9) return `${fmt(bytes / 1e9)} GB`;
  return `${fmt(Math.max(bytes / 1e6, 0.1))} MB`;
}

// Liegt gerade ein Download für dieses Video? Dann { loaded, total, subscribe(fn) }
export function activeDownload(video) {
  return downloads.get(cacheKey(video)) || null;
}

// Speicher dauerhaft machen, damit Safari die Videos nicht bei Platzmangel von selbst löscht
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageInfo() {
  const info = { usage: null, quota: null, persisted: null };
  try {
    if (navigator.storage?.estimate) Object.assign(info, await navigator.storage.estimate());
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted();
  } catch {
    // Manche Browser kennen die Storage-API nicht – dann zeigen wir nur die Videos selbst
  }
  return info;
}

// Prüft vorab grob, ob das Video überhaupt noch passt. Die Angaben der Browser sind ungenau,
// deshalb nur ablehnen, wenn es eindeutig nicht reicht – den Rest fängt cache.put ab.
async function ensureSpace(total) {
  if (!total) return;
  const { usage, quota } = await storageInfo();
  if (quota && usage !== null && quota - usage < total) throw codedError('quota', 'Speicher voll');
}

// Video komplett laden und speichern. meta: { title, courseId, courseName }.
// onProgress(loaded, total) wird während des Downloads aufgerufen; Rückgabe: Größe in Bytes.
export function saveVideo(video, meta = {}) {
  const key = cacheKey(video);
  if (downloads.has(key)) return downloads.get(key).promise;

  const controller = new AbortController();
  const listeners = new Set();
  const entry = {
    loaded: 0,
    total: 0,
    cancel: () => controller.abort(),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const notify = () => listeners.forEach((fn) => fn(entry.loaded, entry.total));

  entry.promise = (async () => {
    // Direkt ans Netz (ohne ?offline), der Service Worker reicht die Anfrage durch
    const response = await fetch(videoHref(video), { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw codedError('status', `Status ${response.status}`, { status: response.status });
    const type = response.headers.get('Content-Type') || 'video/mp4';
    // Läuft die Anmeldung ab, schickt Cloudflare Access eine HTML-Seite statt des Videos
    if (type.startsWith('text/')) throw codedError('status', 'Keine Videodatei', { status: 403 });
    entry.total = Number(response.headers.get('Content-Length')) || 0;
    await ensureSpace(entry.total);
    notify();

    const reader = response.body.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      entry.loaded += value.byteLength;
      notify();
    }
    // Bei komprimierter Übertragung passt Content-Length nicht zu den entpackten Bytes
    if (entry.total && !response.headers.has('Content-Encoding') && entry.loaded !== entry.total) throw codedError('incomplete', 'Unvollständig');

    const blob = new Blob(chunks, { type });
    chunks.length = 0;
    const headers = {
      'Content-Type': type,
      'Content-Length': String(blob.size),
      'X-Title': encodeURIComponent(meta.title || ''),
      'X-Course-Id': encodeURIComponent(meta.courseId || ''),
      'X-Course-Name': encodeURIComponent(meta.courseName || ''),
      'X-Saved-At': new Date().toISOString(),
    };
    const cache = await caches.open(VIDEO_CACHE);
    await cache.put(key, new Response(blob, { headers }));
    requestPersistentStorage();
    return blob.size;
  })().finally(() => downloads.delete(key));

  downloads.set(key, entry);
  return entry.promise;
}

export async function deleteVideo(video) {
  if (!offlineSupported()) return;
  const cache = await caches.open(VIDEO_CACHE);
  await cache.delete(cacheKey(video));
}

// Löschen über die gespeicherte URL (aus listSavedVideos)
export async function deleteSavedUrl(url) {
  const cache = await caches.open(VIDEO_CACHE);
  await cache.delete(url);
}

export async function deleteAllVideos() {
  if (offlineSupported()) await caches.delete(VIDEO_CACHE);
}

const decode = (value) => {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return value || '';
  }
};

// Alle gespeicherten Videos mit Titel, Kurs, Größe und Datum, neueste zuerst
export async function listSavedVideos() {
  if (!offlineSupported() || !(await caches.has(VIDEO_CACHE))) return [];
  const cache = await caches.open(VIDEO_CACHE);
  const requests = await cache.keys();
  const items = await Promise.all(
    requests.map(async (request) => {
      const response = await cache.match(request);
      if (!response) return null;
      const h = response.headers;
      const fileName = decode(new URL(request.url).pathname.split('/').pop());
      return {
        url: request.url,
        title: decode(h.get('X-Title')) || fileName,
        courseId: decode(h.get('X-Course-Id')),
        courseName: decode(h.get('X-Course-Name')),
        size: Number(h.get('Content-Length')) || 0,
        savedAt: h.get('X-Saved-At') || '',
      };
    }),
  );
  return items.filter(Boolean).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
