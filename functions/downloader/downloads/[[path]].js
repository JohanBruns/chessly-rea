// Cloudflare Pages Function: liefert die Kursvideos aus dem privaten R2-Bucket (Binding VIDEOS) aus.
// Gleicher Pfad wie lokal im Dev-Server (/downloader/downloads/<Kurs>/<Datei>.mp4), daher braucht die App
// keine eigene Video-URL. Range-Anfragen werden unterstützt – Safari spielt Videos sonst gar nicht ab.
//
// Zusätzlich zur Cloudflare-Access-Anmeldung vor der Seite prüft die Funktion selbst das Access-Token.
// Fehlt die Konfiguration (ACCESS_TEAM_DOMAIN, ACCESS_AUD), gibt es keine Videos (403).

const PREFIX = '/downloader/downloads/';

// Objektname im Bucket: SHA-256 des Videopfads. Echte Dateinamen wie „4...Nc6!“ hält die Cloudflare-API
// beim Hochladen für Pfad-Angriffe und blockt sie. Das Upload-Skript nutzt dieselbe Funktion.
export async function videoObjectKey(path) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(path));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `videos/${hex}.mp4`;
}

function base64UrlBytes(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const decodePart = (part) => JSON.parse(new TextDecoder().decode(base64UrlBytes(part)));

let certCache = { teamDomain: null, keys: null, loadedAt: 0 };

async function accessKeys(teamDomain, fetchImpl) {
  if (certCache.teamDomain === teamDomain && Date.now() - certCache.loadedAt < 60 * 60 * 1000) return certCache.keys;
  const response = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`Access-Schlüssel nicht ladbar (${response.status})`);
  const { keys } = await response.json();
  certCache = { teamDomain, keys, loadedAt: Date.now() };
  return keys;
}

export function resetCertCache() {
  certCache = { teamDomain: null, keys: null, loadedAt: 0 };
}

export async function verifyAccessToken(token, { teamDomain, aud, now = Date.now(), fetchImpl = fetch }) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return false;
  try {
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodePart(headerPart);
    if (header.alg !== 'RS256') return false;
    const jwk = (await accessKeys(teamDomain, fetchImpl)).find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlBytes(signaturePart), signed))) return false;

    const payload = decodePart(payloadPart);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const seconds = now / 1000;
    return payload.iss === `https://${teamDomain}` && audiences.includes(aud) && payload.exp > seconds && (payload.nbf ?? 0) <= seconds + 60;
  } catch {
    return false;
  }
}

function tokenFrom(request) {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = (request.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith('CF_Authorization='));
  return cookie ? cookie.slice('CF_Authorization='.length) : null;
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
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return new Response('Cloudflare Access ist nicht konfiguriert', { status: 403 });
  if (!(await verifyAccessToken(tokenFrom(request), { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD }))) {
    return new Response('Nicht angemeldet', { status: 403 });
  }

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
