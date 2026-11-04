import { beforeAll, describe, expect, it } from 'vitest';
import { startSession } from '../functions/_lib/auth.js';
import { onRequest, videoObjectKey } from '../functions/downloader/downloads/[[path]].js';
import { fakeD1 } from './helpers/fakeD1.js';

// Minimaler Nachbau des R2-Buckets
function fakeBucket(files) {
  const meta = (key, extra = {}) => ({
    size: files[key].length,
    httpEtag: '"e1"',
    writeHttpMetadata: (h) => h.set('Content-Type', 'video/mp4'),
    ...extra,
  });
  return {
    async head(key) {
      return files[key] ? meta(key) : null;
    },
    async get(key, { range }) {
      if (!files[key]) return null;
      const data = files[key];
      const m = /bytes=(\d+)-(\d*)/.exec(range.get('Range') || '');
      if (!m) return meta(key, { body: data });
      const offset = Number(m[1]);
      if (offset >= data.length) throw new Error('range not satisfiable');
      const end = m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
      return meta(key, { body: data.slice(offset, end + 1), range: { offset, length: end - offset + 1 } });
    },
  };
}

const url = 'https://chessly-rea.pages.dev/downloader/downloads/The%20London%20System/01%20A%20&%20B.mp4';
const env = { DB: fakeD1(), VIDEOS: fakeBucket({ [await videoObjectKey('The London System/01 A & B.mp4')]: new Uint8Array(1000) }) };
let cookie;

beforeAll(async () => {
  await env.DB.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, 0)').bind('johan', 'x').run();
  cookie = (await startSession(new Request(url), env, 1)).split(';')[0];
});

describe('videoObjectKey', () => {
  it('macht aus dem Videopfad einen festen, API-tauglichen Objektnamen', async () => {
    const key = await videoObjectKey('The Caro-Kann Defense/02-01 Weapon 1 4...Nc6! (5. Bb5).mp4');
    expect(key).toMatch(/^videos\/[0-9a-f]{64}\.mp4$/);
    expect(await videoObjectKey('The Caro-Kann Defense/02-01 Weapon 1 4...Nc6! (5. Bb5).mp4')).toBe(key);
    expect(await videoObjectKey('The Caro-Kann Defense/02-02.mp4')).not.toBe(key);
  });
});

describe('Video-Function', () => {
  const request = async (headers = {}, method = 'GET') => onRequest({ request: new Request(url, { method, headers: { Cookie: cookie, ...headers } }), env });

  it('verweigert Videos ohne oder mit ungültiger Anmeldung', async () => {
    expect((await onRequest({ request: new Request(url), env })).status).toBe(401);
    expect((await onRequest({ request: new Request(url, { headers: { Cookie: 'rea_session=erfunden' } }), env })).status).toBe(401);
    expect((await onRequest({ request: new Request(url, { headers: { Cookie: cookie } }), env: { VIDEOS: env.VIDEOS } })).status).toBe(401);
  });

  it('liefert das ganze Video mit Länge und Accept-Ranges', async () => {
    const res = await request();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Length')).toBe('1000');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
  });

  it('beantwortet Range-Anfragen wie Safari sie stellt mit 206', async () => {
    const res = await request({ Range: 'bytes=0-1' });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-1/1000');
    expect(res.headers.get('Content-Length')).toBe('2');
    expect((await res.arrayBuffer()).byteLength).toBe(2);
  });

  it('meldet 416 für einen Bereich hinter dem Dateiende und 404 für unbekannte Videos', async () => {
    const res = await request({ Range: 'bytes=5000-' });
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */1000');
    const missing = await onRequest({ request: new Request(url.replace('01%20A', '99'), { headers: { Cookie: cookie } }), env });
    expect(missing.status).toBe(404);
  });

  it('beantwortet HEAD ohne Body', async () => {
    const res = await request({}, 'HEAD');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Length')).toBe('1000');
  });
});
