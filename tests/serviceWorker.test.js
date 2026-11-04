import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// public/sw.js ist ein klassisches Worker-Skript ohne Exporte. Wir führen es in einem eigenen Kontext aus:
// Funktionsdeklarationen landen dort als globale Eigenschaften, Event-Listener sammeln wir ein.
function loadServiceWorker({ cacheContents = {}, network = async () => new Response('netz') } = {}) {
  const listeners = {};
  const store = new Map(Object.entries(cacheContents));
  const fakeCache = { match: async (key) => store.get(typeof key === 'string' ? key : key.url)?.clone() };
  const context = {
    location: { origin: 'https://app.test' },
    caches: { open: async () => fakeCache, keys: async () => [], delete: async () => true, match: async () => undefined },
    fetch: network,
    Response,
    Headers,
    Blob,
    URL,
    console,
  };
  context.self = context;
  context.addEventListener = (type, fn) => (listeners[type] = fn);
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  return { sw: context, listeners };
}

// fetch-Event nachbauen; liefert die Antwort aus respondWith oder null, wenn der Worker nicht antwortet
async function dispatchFetch(listeners, url, headers = {}) {
  let responded = null;
  const request = new Request(url, { headers });
  listeners.fetch({ request, respondWith: (p) => (responded = p) });
  return responded ? await responded : null;
}

const { sw } = loadServiceWorker();

describe('parseRange', () => {
  it('ohne Header oder bei Unsinn die ganze Datei', () => {
    expect(sw.parseRange(null, 100)).toBe(null);
    expect(sw.parseRange('', 100)).toBe(null);
    expect(sw.parseRange('items=0-5', 100)).toBe(null);
    expect(sw.parseRange('bytes=-', 100)).toBe(null);
    expect(sw.parseRange('bytes=abc', 100)).toBe(null);
    expect(sw.parseRange('bytes=50-10', 100)).toBe(null);
  });

  it('Safaris Probe-Anfrage bytes=0-1', () => {
    expect(sw.parseRange('bytes=0-1', 100)).toEqual({ start: 0, end: 1 });
  });

  it('offenes Ende bis zum letzten Byte', () => {
    expect(sw.parseRange('bytes=40-', 100)).toEqual({ start: 40, end: 99 });
  });

  it('Ende hinter der Datei wird abgeschnitten', () => {
    expect(sw.parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
  });

  it('Suffix: die letzten n Bytes', () => {
    expect(sw.parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(sw.parseRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 });
    expect(sw.parseRange('bytes=-0', 100)).toBe('unsatisfiable');
  });

  it('Start hinter dem Dateiende ist nicht erfüllbar', () => {
    expect(sw.parseRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(sw.parseRange('bytes=0-1', 0)).toBe('unsatisfiable');
  });

  it('bei mehreren Bereichen zählt der erste', () => {
    expect(sw.parseRange('bytes=0-9, 20-29', 100)).toEqual({ start: 0, end: 9 });
  });

  it('Leerzeichen und Großschreibung sind egal', () => {
    expect(sw.parseRange(' Bytes = 5 - 9 ', 100)).toEqual({ start: 5, end: 9 });
  });
});

const BYTES = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
const stored = () => new Response(new Blob([BYTES], { type: 'video/mp4' }), { headers: { 'Content-Type': 'video/mp4' } });

describe('rangeResponse', () => {
  it('ohne Range die ganze Datei mit 200', async () => {
    const res = await sw.rangeResponse(stored(), null);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Length')).toBe('100');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
  });

  it('206 mit Content-Range und dem passenden Ausschnitt', async () => {
    const res = await sw.rangeResponse(stored(), 'bytes=10-19');
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 10-19/100');
    expect(res.headers.get('Content-Length')).toBe('10');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('Probe-Anfrage bytes=0-1 liefert genau zwei Bytes', async () => {
    const res = await sw.rangeResponse(stored(), 'bytes=0-1');
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-1/100');
    expect((await res.arrayBuffer()).byteLength).toBe(2);
  });

  it('416 mit der Dateigröße, wenn der Bereich außerhalb liegt', async () => {
    const res = await sw.rangeResponse(stored(), 'bytes=200-');
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */100');
  });
});

describe('fetch-Handler für die Schnittstelle', () => {
  it('fasst Antworten der Schnittstelle nicht an', async () => {
    const API = 'https://app.test/api/ranking';
    const { listeners } = loadServiceWorker({ cacheContents: { [API]: new Response('veraltet') } });
    expect(await dispatchFetch(listeners, API)).toBe(null);
  });
});

describe('fetch-Handler für den geschützten App-Teil', () => {
  const CHUNK = 'https://app.test/app/app-abc.js';
  const signedOut = async () => new Response('Nicht angemeldet', { status: 401 });

  it('liefert die gespeicherte Datei auch offline und bei abgelaufener Anmeldung', async () => {
    const offline = async () => {
      throw new Error('offline');
    };
    for (const network of [offline, signedOut]) {
      const { listeners } = loadServiceWorker({ cacheContents: { [CHUNK]: new Response('app') }, network });
      expect(await (await dispatchFetch(listeners, CHUNK)).text()).toBe('app');
    }
  });

  it('reicht ohne gespeicherte Datei die Ablehnung des Servers durch', async () => {
    const { listeners } = loadServiceWorker({ network: signedOut });
    expect((await dispatchFetch(listeners, CHUNK)).status).toBe(401);
  });
});

describe('fetch-Handler für Videos', () => {
  const VIDEO = 'https://app.test/downloader/downloads/Kurs/Video%201.mp4';

  it('nicht gespeicherte Videos (ohne ?offline) fasst der Worker nicht an', async () => {
    const { listeners } = loadServiceWorker({ cacheContents: { [VIDEO]: stored() } });
    expect(await dispatchFetch(listeners, VIDEO, { Range: 'bytes=0-1' })).toBe(null);
  });

  it('gespeicherte Videos kommen mit Range aus dem Video-Cache', async () => {
    const network = async () => {
      throw new Error('offline');
    };
    const { listeners } = loadServiceWorker({ cacheContents: { [VIDEO]: stored() }, network });
    const res = await dispatchFetch(listeners, `${VIDEO}?offline`, { Range: 'bytes=0-1' });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-1/100');
  });

  it('fehlt das Video im Cache, geht die Anfrage ans Netz', async () => {
    const { listeners } = loadServiceWorker({ network: async () => new Response('aus dem netz', { status: 200 }) });
    const res = await dispatchFetch(listeners, `${VIDEO}?offline`);
    expect(await res.text()).toBe('aus dem netz');
  });
});
