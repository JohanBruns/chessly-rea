import { beforeEach, describe, expect, it } from 'vitest';
import catalog from '../downloader/catalog.json';
import { onRequestGet, onRequestPost } from '../functions/api/courseRequests.js';
import { onRequestPost as register } from '../functions/api/register.js';
import { filterChesslyCourses } from '../src/views/chesslyView.js';
import { fakeD1 } from './helpers/fakeD1.js';

const ORIGIN = 'https://chessly-rea.pages.dev';
const available = catalog.courses.filter((course) => !course.comingSoon);
const comingSoon = catalog.courses.find((course) => course.comingSoon);
let env;

const post = (handler, path, body, cookie) =>
  handler({
    env,
    request: new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    }),
  });

async function signUp(username) {
  const response = await post(register, '/api/register', { username, password: 'geheim', inviteCode: 'code' });
  return response.headers.get('Set-Cookie').split(';')[0];
}

const add = (courseId, cookie) => post(onRequestPost, '/api/courseRequests', { courseId }, cookie);
const list = (cookie) => onRequestGet({ env, request: new Request(`${ORIGIN}/api/courseRequests`, { headers: cookie ? { Cookie: cookie } : {} }) });
const rows = async () => (await env.DB.prepare('SELECT * FROM course_requests ORDER BY requested_at').all()).results;
const setStatus = (id, status, message = null) =>
  env.DB.prepare('UPDATE course_requests SET status = ?, message = ? WHERE chessly_id = ?').bind(status, message, id).run();

beforeEach(() => {
  env = { DB: fakeD1(), INVITE_CODE: 'code' };
});

describe('Filter „In Arbeit“', () => {
  it('zeigt nur wartende und laufende Kurse', () => {
    const courses = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id, description: '' }));
    const requests = { a: { status: 'queued' }, b: { status: 'running' }, c: { status: 'done' }, d: { status: 'failed' } };
    expect(filterChesslyCourses(courses, { filter: 'requested', requests }).map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('Kurs hinzufügen', () => {
  it('verlangt eine Anmeldung', async () => {
    expect((await list()).status).toBe(401);
    expect((await add(available[0].id)).status).toBe(401);
    expect(await rows()).toEqual([]);
  });

  it('legt den Kurs mit Name und Link aus dem Katalog in die Warteschlange', async () => {
    const cookie = await signUp('anna');
    const response = await add(available[0].id, cookie);
    expect(response.status).toBe(200);
    expect((await response.json()).request).toEqual({ id: available[0].id, status: 'queued', message: null });

    const [row] = await rows();
    expect(row).toMatchObject({ chessly_id: available[0].id, name: available[0].name, url: available[0].url, status: 'queued' });
  });

  it('lädt nur, was im Katalog steht', async () => {
    const cookie = await signUp('anna');
    for (const courseId of ['erfunden', 'https://example.com/kurs', null, 42]) {
      expect((await add(courseId, cookie)).status).toBe(404);
    }
    expect(await rows()).toEqual([]);
  });

  it('nimmt Kurse nicht an, die bei Chessly noch nicht erschienen sind', async () => {
    const response = await add(comingSoon.id, await signUp('anna'));
    expect(response.status).toBe(409);
    expect(await rows()).toEqual([]);
  });

  it('zeigt allen Konten denselben Stand und legt keinen Kurs doppelt an', async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    await add(available[0].id, anna);

    const second = await add(available[0].id, ben);
    expect((await second.json()).request.status).toBe('queued');
    expect(await rows()).toHaveLength(1);
    expect((await (await list(ben)).json()).requests).toEqual([{ id: available[0].id, status: 'queued', message: null }]);
  });

  it('startet einen laufenden oder fertigen Kurs nicht neu', async () => {
    const cookie = await signUp('anna');
    await add(available[0].id, cookie);
    for (const status of ['running', 'done']) {
      await setStatus(available[0].id, status);
      expect((await (await add(available[0].id, cookie)).json()).request.status).toBe(status);
    }
  });

  it('stellt einen fehlgeschlagenen Kurs neu an und löscht die Fehlermeldung', async () => {
    const cookie = await signUp('anna');
    await add(available[0].id, cookie);
    await setStatus(available[0].id, 'failed', 'Hochladen oder Veröffentlichen ist fehlgeschlagen.');

    const response = await add(available[0].id, await signUp('ben'));
    expect((await response.json()).request).toEqual({ id: available[0].id, status: 'queued', message: null });
  });

  it('begrenzt die offenen Kurse pro Konto, aber nicht die Kurse anderer Konten', async () => {
    const anna = await signUp('anna');
    for (const course of available.slice(0, 3)) expect((await add(course.id, anna)).status).toBe(200);
    expect((await add(available[3].id, anna)).status).toBe(429);
    expect((await add(available[3].id, await signUp('ben'))).status).toBe(200);

    // Ein schon offener Kurs zählt nicht als neuer Auftrag, ein fertiger gibt den Platz wieder frei
    expect((await add(available[0].id, anna)).status).toBe(200);
    await setStatus(available[0].id, 'done');
    expect((await add(available[4].id, anna)).status).toBe(200);
  });

  it('gibt nicht heraus, welches Konto einen Kurs angestoßen hat', async () => {
    const cookie = await signUp('anna');
    await add(available[0].id, cookie);
    const { requests } = await (await list(cookie)).json();
    expect(Object.keys(requests[0]).sort()).toEqual(['id', 'message', 'status']);
  });
});
