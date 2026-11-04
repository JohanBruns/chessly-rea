// Cloudflare Pages Function: liefert die Kursvideos aus dem privaten R2-Bucket (Binding VIDEOS) aus.
// Gleicher Pfad wie lokal im Dev-Server (/downloader/downloads/<Kurs>/<Datei>.mp4), daher braucht die App
// keine eigene Video-URL. Range-Anfragen werden unterstützt – Safari spielt Videos sonst gar nicht ab.
//
// Videos gibt es nur mit gültiger Anmeldung an einem Konto (Sitzungs-Cookie, siehe functions/_lib/auth.js).
import { sessionUser } from '../../_lib/auth.js';

const PREFIX = '/downloader/downloads/';

// Objektname im Bucket: SHA-256 des Videopfads. Echte Dateinamen wie „4...Nc6!“ hält die Cloudflare-API
// beim Hochladen für Pfad-Angriffe und blockt sie. Das Upload-Skript nutzt dieselbe Funktion.
export async function videoObjectKey(path) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(path));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `videos/${hex}.mp4`;
}

// Antwort für ein R2-Objekt (mit oder ohne Body), inklusive 206 bei Range-Anfragen
export function videoResponse(object, { rangeRequested, head = false }) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'video/mp4');
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'private, max-age=86400');

  const hasBody = 'body' in object;
  if (!head && !hasBody) return new Response(null, { status: 304, headers });

  const size = object.size;
  if (rangeRequested && object.range) {
    const range = object.range;
    const offset = 'suffix' in range ? Math.max(0, size - range.suffix) : (range.offset ?? 0);
    const length = 'suffix' in range ? size - offset : (range.length ?? size - offset);
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${size}`);
    headers.set('Content-Length', String(length));
    return new Response(head ? null : object.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(size));
  return new Response(head ? null : object.body, { status: 200, headers });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Methode nicht erlaubt', { status: 405, headers: { Allow: 'GET, HEAD' } });
  if (!(await sessionUser(request, env))) return new Response('Nicht angemeldet', { status: 401 });

  const { pathname } = new URL(request.url);
  let path;
  try {
    path = decodeURIComponent(pathname.slice(PREFIX.length));
  } catch {
    return new Response('Ungültiger Pfad', { status: 400 });
  }
  if (!path) return new Response('Nicht gefunden', { status: 404 });
  const key = await videoObjectKey(path);

  const rangeRequested = request.headers.has('Range');
  if (request.method === 'HEAD') {
    const object = await env.VIDEOS.head(key);
    return object ? videoResponse(object, { rangeRequested: false, head: true }) : new Response(null, { status: 404 });
  }

  let object;
  try {
    object = await env.VIDEOS.get(key, { range: request.headers, onlyIf: request.headers });
  } catch {
    // z. B. Range hinter dem Dateiende
    const info = await env.VIDEOS.head(key);
    if (!info) return new Response('Nicht gefunden', { status: 404 });
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } });
  }
  if (!object) return new Response('Nicht gefunden', { status: 404 });
  return videoResponse(object, { rangeRequested });
}
