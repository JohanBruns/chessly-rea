// Service Worker: hält die App (HTML, JS, CSS, Stockfish) für den Offline-Betrieb vor.
// Videos laufen immer übers Netz – sie sind zu groß für den Cache und brauchen Range-Anfragen.
const CACHE = 'chessly-rea-v1';
const STATIC = ['/stockfish/stockfish-19-lite-single.js', '/stockfish/stockfish-19-lite-single.wasm', '/icons/appleTouchIcon.png'];

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
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const cacheable = (response) => response.ok && response.type === 'basic';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
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
