import { beforeEach, describe, expect, it } from 'vitest';
import { onRequest, resetCertCache, verifyAccessToken, videoObjectKey } from '../functions/downloader/downloads/[[path]].js';

const TEAM = 'johan.cloudflareaccess.com';
const AUD = 'aud-123';

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const part = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

const { privateKey, publicKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
const certFetch = async () => new Response(JSON.stringify({ keys: [jwk] }));
globalThis.fetch = certFetch;

async function token(payload, header = { alg: 'RS256', kid: 'k1' }) {
  const data = `${part(header)}.${part(payload)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

const valid = () => ({ iss: `https://${TEAM}`, aud: [AUD], exp: Math.floor(Date.now() / 1000) + 3600 });

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

const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, VIDEOS: fakeBucket({ [await videoObjectKey('The London System/01 A & B.mp4')]: new Uint8Array(1000) }) };
const url = 'https://chessly-rea.pages.dev/downloader/downloads/The%20London%20System/01%20A%20&%20B.mp4';

beforeEach(() => resetCertCache());

describe('videoObjectKey', () => {
  it('macht aus dem Videopfad einen festen, API-tauglichen Objektnamen', async () => {
    const key = await videoObjectKey('The Caro-Kann Defense/02-01 Weapon 1 4...Nc6! (5. Bb5).mp4');
    expect(key).toMatch(/^videos\/[0-9a-f]{64}\.mp4$/);
    expect(await videoObjectKey('The Caro-Kann Defense/02-01 Weapon 1 4...Nc6! (5. Bb5).mp4')).toBe(key);
    expect(await videoObjectKey('The Caro-Kann Defense/02-02.mp4')).not.toBe(key);
  });
});

describe('verifyAccessToken', () => {
  it('akzeptiert ein gültiges Token', async () => {
    expect(await verifyAccessToken(await token(valid()), { teamDomain: TEAM, aud: AUD, fetchImpl: certFetch })).toBe(true);
  });

  it('lehnt abgelaufene, fremde und manipulierte Tokens ab', async () => {
    const opts = { teamDomain: TEAM, aud: AUD, fetchImpl: certFetch };
    expect(await verifyAccessToken(await token({ ...valid(), exp: 1 }), opts)).toBe(false);
    expect(await verifyAccessToken(await token({ ...valid(), aud: ['andere-app'] }), opts)).toBe(false);
    expect(await verifyAccessToken(await token({ ...valid(), iss: 'https://evil.cloudflareaccess.com' }), opts)).toBe(false);
    const [h, , s] = (await token(valid())).split('.');
    expect(await verifyAccessToken(`${h}.${part({ ...valid(), exp: 9999999999 })}.${s}`, opts)).toBe(false);
    expect(await verifyAccessToken(await token(valid(), { alg: 'none', kid: 'k1' }), opts)).toBe(false);
    expect(await verifyAccessToken('kein-token', opts)).toBe(false);
  });
});

describe('Video-Function', () => {
  const request = async (headers = {}, method = 'GET') =>
    onRequest({ request: new Request(url, { method, headers: { 'Cf-Access-Jwt-Assertion': await token(valid()), ...headers } }), env });

  it('verweigert Videos ohne Anmeldung oder ohne Konfiguration', async () => {
    expect((await onRequest({ request: new Request(url), env })).status).toBe(403);
    const res = await onRequest({ request: new Request(url, { headers: { 'Cf-Access-Jwt-Assertion': await token(valid()) } }), env: { ...env, ACCESS_AUD: '' } });
    expect(res.status).toBe(403);
  });

  it('nimmt das Token auch aus dem Access-Cookie', async () => {
    const res = await onRequest({ request: new Request(url, { headers: { Cookie: `foo=1; CF_Authorization=${await token(valid())}` } }), env });
    expect(res.status).toBe(200);
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
    const missing = await onRequest({
      request: new Request(url.replace('01%20A', '99'), { headers: { 'Cf-Access-Jwt-Assertion': await token(valid()) } }),
      env,
    });
    expect(missing.status).toBe(404);
  });

  it('beantwortet HEAD ohne Body', async () => {
    const res = await request({}, 'HEAD');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Length')).toBe('1000');
  });
});
