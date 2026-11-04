import { beforeEach, describe, expect, it } from 'vitest';
import { credentialsError, hashPassword, sessionUser, verifyPassword } from '../functions/_lib/auth.js';
import { onRequestPost as login } from '../functions/api/login.js';
import { onRequestPost as logout } from '../functions/api/logout.js';
import { onRequestPost as register } from '../functions/api/register.js';
import { onRequestPost as syncApi } from '../functions/api/sync.js';
import { fakeD1 } from './helpers/fakeD1.js';

const ORIGIN = 'https://chessly-rea.pages.dev';
let env;

const post = (handler, path, body, cookie) =>
  handler({
    env,
    request: new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  });

const cookieOf = (response) => response.headers.get('Set-Cookie').split(';')[0];

async function signUp(username, password = 'geheim') {
  const response = await post(register, '/api/register', { username, password });
  expect(response.status).toBe(201);
  return cookieOf(response);
}

const sync = async (cookie, body) => (await post(syncApi, '/api/sync', body, cookie)).json();

beforeEach(() => {
  env = { DB: fakeD1() };
});

describe('Passwörter', () => {
  it('speichert nie das Passwort selbst und erkennt es wieder', async () => {
    const stored = await hashPassword('geheim');
    expect(stored).not.toContain('geheim');
    expect(await verifyPassword('geheim', stored)).toBe(true);
    expect(await verifyPassword('falsch', stored)).toBe(false);
    expect(await hashPassword('geheim')).not.toBe(stored);
  });

  it('prüft Benutzername und Passwort', () => {
    expect(credentialsError('Jöhan_2', 'geheim')).toBe(null);
    expect(credentialsError('ab', 'geheim')).toMatch(/Benutzername/);
    expect(credentialsError('mit leerzeichen', 'geheim')).toMatch(/Benutzername/);
    expect(credentialsError('johan', '123')).toMatch(/Passwort/);
    expect(credentialsError(undefined, undefined)).toMatch(/Benutzername/);
  });
});

describe('Registrieren und Anmelden', () => {
  it('legt ein Konto an und meldet direkt an', async () => {
    const response = await post(register, '/api/register', { username: 'johan', password: 'geheim' });
    expect(response.status).toBe(201);
    expect((await response.json()).user.username).toBe('johan');
    const header = response.headers.get('Set-Cookie');
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/Secure/);
    const user = await sessionUser(new Request(ORIGIN, { headers: { Cookie: cookieOf(response) } }), env);
    expect(user.username).toBe('johan');
  });

  it('lehnt vergebene Namen ab, auch in anderer Schreibweise', async () => {
    await signUp('johan');
    const response = await post(register, '/api/register', { username: 'JOHAN', password: 'anderes' });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/vergeben/);
  });

  it('lehnt ungültige Eingaben und kaputtes JSON ab', async () => {
    expect((await post(register, '/api/register', { username: 'x', password: 'geheim' })).status).toBe(400);
    expect((await post(register, '/api/register', 'kein json')).status).toBe(400);
    expect((await post(login, '/api/login', 'kein json')).status).toBe(401);
  });

  it('meldet nur mit dem richtigen Passwort an, Schreibweise des Namens ist egal', async () => {
    await signUp('johan');
    const ok = await post(login, '/api/login', { username: 'Johan', password: 'geheim' });
    expect(ok.status).toBe(200);
    expect((await ok.json()).user.username).toBe('johan');
    expect((await post(login, '/api/login', { username: 'johan', password: 'falsch' })).status).toBe(401);
    expect((await post(login, '/api/login', { username: 'niemand', password: 'geheim' })).status).toBe(401);
  });

  it('beendet die Sitzung beim Abmelden', async () => {
    const cookie = await signUp('johan');
    const response = await post(logout, '/api/logout', {}, cookie);
    expect(response.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);
    expect((await post(syncApi, '/api/sync', {}, cookie)).status).toBe(401);
  });

  it('akzeptiert abgelaufene Sitzungen nicht', async () => {
    const cookie = await signUp('johan');
    const request = new Request(ORIGIN, { headers: { Cookie: cookie } });
    expect(await sessionUser(request, env, Date.now() + 366 * 24 * 60 * 60 * 1000)).toBe(null);
  });
});

describe('Sync-Schnittstelle', () => {
  it('verlangt eine Anmeldung', async () => {
    expect((await post(syncApi, '/api/sync', { changes: { xp: { total: 1 } } })).status).toBe(401);
    expect((await post(syncApi, '/api/sync', {}, 'rea_session=erfunden')).status).toBe(401);
  });

  it('speichert Änderungen und zählt die Version hoch', async () => {
    const cookie = await signUp('johan');
    expect(await sync(cookie, { base: {}, changes: { xp: { total: 5 } } })).toEqual({ accepted: { xp: 1 }, updates: {}, tooLarge: [] });
    expect(await sync(cookie, { base: { xp: 1 }, changes: { xp: { total: 9 } } })).toEqual({ accepted: { xp: 2 }, updates: {}, tooLarge: [] });
    expect((await sync(cookie, { base: {}, changes: {} })).updates).toEqual({ xp: { version: 2, value: { total: 9 } } });
  });

  it('überschreibt keinen neueren Stand, sondern liefert ihn zurück', async () => {
    const cookie = await signUp('johan');
    await sync(cookie, { base: {}, changes: { xp: { total: 5 } } });
    const res = await sync(cookie, { base: {}, changes: { xp: { total: 1 } } });
    expect(res.accepted).toEqual({});
    expect(res.updates.xp).toEqual({ version: 1, value: { total: 5 } });
  });

  it('trennt die Daten der Konten', async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    await sync(anna, { base: {}, changes: { progress: { line: { reps: 3 } } } });
    expect(await sync(ben, { base: {}, changes: {} })).toEqual({ accepted: {}, updates: {}, tooLarge: [] });
    await sync(ben, { base: {}, changes: { progress: { line: { reps: 1 } } } });
    expect((await sync(anna, { base: {}, changes: {} })).updates.progress.value).toEqual({ line: { reps: 3 } });
  });

  it('ignoriert unbekannte Daten und meldet zu große', async () => {
    const cookie = await signUp('johan');
    const res = await sync(cookie, { base: {}, changes: { fremd: { a: 1 }, imported: 'x'.repeat(1_500_001) } });
    expect(res).toEqual({ accepted: {}, updates: {}, tooLarge: ['imported'] });
  });
});
