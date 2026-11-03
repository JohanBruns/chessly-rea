// Service Worker: hält die App (HTML, JS, CSS, Stockfish) für den Offline-Betrieb vor.
// Videos streamen normal übers Netz. Nur Videos, die auf der Videoseite „offline gespeichert“ wurden,
// liegen in einem eigenen Cache (VIDEO_CACHE) – getrennt vom App-Cache, damit ein neuer Deploy sie nicht löscht.
const CACHE = 'chessly-rea-v1';
// Gleicher Name wie in src/offlineVideos.js
const VIDEO_CACHE = 'chessly-rea-videos';
const VIDEO_PREFIX = '/downloader/downloads/';
// Die App hängt ?offline an die Video-URL, wenn das Video gespeichert ist. Nur dann antwortet der
// Service Worker selbst – alle anderen Videoanfragen gehen unverändert ans Netz.
const OFFLINE_PARAM = 'offline';
const STATIC = ['/stockfish/stockfish-19-lite-single.js', '/stockfish/stockfish-19-lite-single.wasm', '/icons/appleTouchIcon.png'];

// Range-Header („bytes=0-1“, „bytes=100-“, „bytes=-500“) für eine Datei mit size Bytes auswerten.
// Ergebnis: null (kein/ungültiger Header → ganze Datei), 'unsatisfiable' (→ 416) oder { start, end } inklusive.
// Mehrere Bereiche („bytes=0-1,5-9“) unterstützen wir nicht; dann zählt nur der erste – Safari fragt nie mehrere an.
function parseRange(header, size) {
  if (!header) return null;
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*(?:,.*)?$/i.exec(header);
  if (!match) return null;
  const [, from, to] = match;
  if (from === '' && to === '') return null;
  let start;
  let end;
  if (from === '') {
    // Suffix: die letzten n Bytes
    const suffix = Number(to);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(from);
    end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
    if (to !== '' && Number(to) < start) return null;
  }
  if (start >= size || size === 0) return 'unsatisfiable';
  return { start, end };
}

// Antwort aus einem gespeicherten Video bauen: 200 mit der ganzen Datei oder 206 mit dem angefragten
// Ausschnitt aus dem Blob. Safari fragt Videos immer per Range an (zuerst „bytes=0-1“) und spielt ohne 206 nicht ab.
async function rangeResponse(cached, rangeHeader) {
  const blob = await cached.blob();
  const size = blob.size;
  const type = cached.headers.get('Content-Type') || blob.type || 'video/mp4';
  const range = parseRange(rangeHeader, size);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const headers = new Headers({ 'Content-Type': type, 'Accept-Ranges': 'bytes' });
  if (!range) {
    headers.set('Content-Length', String(size));
    return new Response(blob, { status: 200, headers });
  }
  const { start, end } = range;
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(blob.slice(start, end + 1, type), { status: 206, headers });
}

// Gespeichertes Video ausliefern; fehlt es im Cache (z. B. gerade gelöscht), normal übers Netz laden
async function savedVideo(request, url) {
  const cache = await caches.open(VIDEO_CACHE);
  const cached = await cache.match(url.origin + url.pathname);
  if (!cached) return fetch(request);
  return rangeResponse(cached, request.headers.get('range'));
}

// Beim ersten Start alles vorhalten, was index.html lädt – sonst fehlen JS/CSS, wenn die App
// danach gleich offline geöffnet wird
async function precache() {
  const cache = await caches.open(CACHE);
  const response = await fetch('/');
  if (!cacheable(response)) return;
  const html = await response.clone().text();
  await cache.put('/', response);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  await cache.addAll([...assets, ...STATIC]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== VIDEO_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(response) {
  return response.ok && response.type === 'basic';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith(VIDEO_PREFIX)) {
    if (url.searchParams.has(OFFLINE_PARAM)) event.respondWith(savedVideo(request, url));
    return;
  }
  if (url.pathname.startsWith('/downloader/') || url.pathname.startsWith('/cdn-cgi/') || request.headers.has('range')) return;

  // Seitenaufrufe: erst das Netz (neue Version, Anmeldung), offline die gespeicherte App
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (cacheable(response)) caches.open(CACHE).then((cache) => cache.put('/', response.clone()));
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Dateien: sofort aus dem Cache, im Hintergrund aktualisieren
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (cacheable(response)) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
