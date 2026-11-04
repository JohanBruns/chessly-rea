import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as register } from '../functions/api/register.js';
import { onRequestPost as syncApi } from '../functions/api/sync.js';
import { createSync, mergeData } from '../src/sync.js';
import { fakeD1 } from './helpers/fakeD1.js';

const ORIGIN = 'https://chessly-rea.pages.dev';
let env;
let cookie;

// Ein Gerät: eigener lokaler Speicher, spricht mit der echten Sync-Funktion
function device() {
  const data = {};
  let meta = { versions: {}, dirty: {}, seq: 0 };
  const engine = createSync({
    store: {
      read: (name) => data[name],
      write: (name, value) => (data[name] = value),
      loadMeta: () => structuredClone(meta),
      saveMeta: (next) => (meta = structuredClone(next)),
    },
    post: async (body) => {
      const response = await syncApi({
        env,
        request: new Request(`${ORIGIN}/api/sync`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      return response.json();
    },
  });
  return {
    data,
    engine,
    meta: () => meta,
    change(name, value) {
      data[name] = value;
      engine.markDirty(name);
    },
  };
}

beforeEach(async () => {
  env = { DB: fakeD1() };
  const response = await register({
    env,
    request: new Request(`${ORIGIN}/api/register`, { method: 'POST', body: JSON.stringify({ username: 'johan', password: 'geheim' }) }),
  });
  cookie = response.headers.get('Set-Cookie').split(';')[0];
});

describe('mergeData', () => {
  it('nimmt pro Variante den zuletzt gelernten Stand', () => {
    const local = { a: { lastReviewed: 5, reps: 1 }, b: { lastReviewed: 1, reps: 1 }, nurLokal: { lastReviewed: 1 } };
    const remote = { a: { lastReviewed: 2, reps: 9 }, b: { lastReviewed: 7, reps: 9 }, nurServer: { lastReviewed: 1 } };
    expect(mergeData('progress', local, remote)).toEqual({
      a: { lastReviewed: 5, reps: 1 },
      b: { lastReviewed: 7, reps: 9 },
      nurLokal: { lastReviewed: 1 },
      nurServer: { lastReviewed: 1 },
    });
  });

  it('vereint abgeschlossene Kacheln und behält den lokalen Kurs', () => {
    const merged = mergeData('state', { drills: { x: 5 }, videos: {}, started: { k: 1 }, lastCourse: 'lokal' }, { drills: { x: 3, y: 2 }, videos: { v: 1 }, started: {}, lastCourse: 'server' });
    expect(merged).toEqual({ drills: { x: 5, y: 2 }, videos: { v: 1 }, started: { k: 1 }, lastCourse: 'lokal' });
  });

  it('verliert bei XP keine Tage', () => {
    const merged = mergeData('xp', { total: 15, byDay: { d1: 10, d2: 5 } }, { total: 30, byDay: { d1: 10, d3: 20 } });
    expect(merged.byDay).toEqual({ d1: 10, d2: 5, d3: 20 });
    expect(merged.total).toBe(35);
  });

  it('vereint importierte Kurse nach ID, Einstellungen: lokal gewinnt', () => {
    expect(mergeData('imported', [{ id: 'a', v: 'lokal' }], [{ id: 'a', v: 'server' }, { id: 'b' }])).toEqual([{ id: 'b' }, { id: 'a', v: 'lokal' }]);
    expect(mergeData('settings', { theme: 'light' }, { theme: 'dark', sound: false })).toEqual({ theme: 'light', sound: false });
  });

  it('kommt mit fehlenden Ständen zurecht', () => {
    expect(mergeData('xp', undefined, { total: 1 })).toEqual({ total: 1 });
    expect(mergeData('xp', { total: 1 }, undefined)).toEqual({ total: 1 });
  });
});

describe('Abgleich zwischen zwei Geräten', () => {
  it('bringt den Lernstand auf ein neues Gerät', async () => {
    const handy = device();
    handy.change('progress', { line: { lastReviewed: 1, reps: 2 } });
    await handy.engine.sync();
    expect(handy.meta().dirty).toEqual({});

    const zweitesHandy = device();
    expect(await zweitesHandy.engine.sync()).toEqual(['progress']);
    expect(zweitesHandy.data.progress).toEqual({ line: { lastReviewed: 1, reps: 2 } });
  });

  it('führt offline entstandene Änderungen beider Geräte zusammen', async () => {
    const a = device();
    const b = device();
    a.change('progress', { line1: { lastReviewed: 1 } });
    b.change('progress', { line2: { lastReviewed: 2 } });
    await a.engine.sync();
    await b.engine.sync();
    await a.engine.sync();

    const beide = { line1: { lastReviewed: 1 }, line2: { lastReviewed: 2 } };
    expect(a.data.progress).toEqual(beide);
    expect(b.data.progress).toEqual(beide);
    expect(a.meta().dirty).toEqual({});
    expect(b.meta().dirty).toEqual({});
  });

  it('übernimmt ein Zurücksetzen vom anderen Gerät, wenn lokal nichts offen ist', async () => {
    const a = device();
    const b = device();
    a.change('progress', { line: { lastReviewed: 1 } });
    await a.engine.sync();
    await b.engine.sync();
    a.change('progress', {});
    await a.engine.sync();
    await b.engine.sync();
    expect(b.data.progress).toEqual({});
  });

  it('behält offene Änderungen ohne Netz und schickt sie später', async () => {
    const a = device();
    a.change('xp', { total: 5, byDay: {} });
    const failing = createSync({
      store: { read: (name) => a.data[name], write: () => {}, loadMeta: () => structuredClone(a.meta()), saveMeta: () => {} },
      post: async () => {
        throw new TypeError('offline');
      },
    });
    await expect(failing.sync()).rejects.toThrow('offline');
    expect(Object.keys(a.meta().dirty)).toEqual(['xp']);

    await a.engine.sync();
    expect(a.meta().dirty).toEqual({});
    expect(await device().engine.sync()).toEqual(['xp']);
  });

  it('bleibt dirty, wenn während der Anfrage weitergespeichert wurde', async () => {
    const a = device();
    a.change('xp', { total: 1, byDay: {} });
    const pending = a.engine.sync();
    a.change('xp', { total: 2, byDay: {} });
    await pending;
    await a.engine.sync();
    expect(a.meta().dirty).toEqual({});
    const b = device();
    await b.engine.sync();
    expect(b.data.xp.total).toBe(2);
  });

  it('blockiert nicht, wenn ein Wert zu groß ist', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = device();
    a.change('imported', ['x'.repeat(1_500_001)]);
    a.change('xp', { total: 3, byDay: {} });
    await a.engine.sync();
    expect(a.meta().dirty).toEqual({});
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    const b = device();
    await b.engine.sync();
    expect(b.data.xp.total).toBe(3);
    expect(b.data.imported).toBeUndefined();
  });
});
