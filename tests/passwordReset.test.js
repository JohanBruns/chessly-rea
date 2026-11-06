import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as forgotPassword } from '../functions/api/forgotPassword.js';
import { onRequestPost as login } from '../functions/api/login.js';
import { onRequestPost as register } from '../functions/api/register.js';
import { onRequestPost as resetPassword } from '../functions/api/resetPassword.js';
import { onRequestPost as syncApi } from '../functions/api/sync.js';
import { fakeD1 } from './helpers/fakeD1.js';

const ORIGIN = 'https://chessly-rea.pages.dev';
const HOUR = 60 * 60 * 1000;
const START = Date.UTC(2026, 10, 6, 12);
let env;
let mails;
let resendStatus;
let background;

const post = (handler, path, body, { cookie, ip = '1.1.1.1' } = {}) =>
  handler({
    env,
    waitUntil: (promise) => background.push(promise),
    request: new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...(cookie ? { Cookie: cookie } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  });

async function forgot(username, options) {
  const response = await post(forgotPassword, '/api/forgotPassword', { username }, options);
  await Promise.all(background);
  return response;
}

const reset = (token, password, options) => post(resetPassword, '/api/resetPassword', { token, password }, options);
const tryLogin = (password, username = 'johan') => post(login, '/api/login', { username, password }, { ip: '9.9.9.9' });
const cookieOf = (response) => response.headers.get('Set-Cookie').split(';')[0];
const tokenFrom = (mail) => /#\/passwort-neu\?token=([0-9a-f]+)/.exec(mail.text)[1];
const storedResets = async () => (await env.DB.prepare('SELECT * FROM password_resets').all()).results;

async function requestLink(username = 'johan') {
  await forgot(username);
  return tokenFrom(mails.at(-1));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: START });
  env = { DB: fakeD1(), INVITE_CODE: 'code', RESEND_API_KEY: 're_test', ADMIN_EMAIL: 'admin@example.org' };
  mails = [];
  resendStatus = 200;
  background = [];
  vi.stubGlobal('fetch', async (url, init) => {
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    if (resendStatus === 200) mails.push(JSON.parse(init.body));
    return new Response('{}', { status: resendStatus });
  });
  const response = await post(register, '/api/register', { username: 'johan', password: 'geheim', inviteCode: 'code' }, { ip: '8.8.8.8' });
  expect(response.status).toBe(201);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Link anfordern', () => {
  it('schickt den Link an den Admin und speichert nur seinen Hash', async () => {
    const response = await forgot('Johan');
    expect(response.status).toBe(200);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toEqual(['admin@example.org']);
    expect(mails[0].subject).toContain('johan');
    expect(mails[0].text).toContain(`${ORIGIN}/#/passwort-neu?token=`);

    const [row] = await storedResets();
    expect(row.token_hash).not.toBe(tokenFrom(mails[0]));
    expect(row.expires_at).toBe(START + 24 * HOUR);
  });

  it('antwortet bei unbekannten Namen genauso, ohne Mail und ohne Eintrag', async () => {
    const known = await forgot('johan');
    const unknown = await forgot('niemand');
    const broken = await post(forgotPassword, '/api/forgotPassword', 'kein json');
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(broken.status).toBe(200);
    expect(mails).toHaveLength(1);
    expect(await storedResets()).toHaveLength(1);
  });

  it('schickt pro Konto höchstens eine Mail in der Stunde', async () => {
    await forgot('johan');
    await forgot('johan');
    expect(mails).toHaveLength(1);
    vi.setSystemTime(START + HOUR + 1);
    await forgot('johan');
    expect(mails).toHaveLength(2);
  });

  it('sperrt den Absender nach zehn Anfragen', async () => {
    for (let i = 0; i < 10; i++) expect((await forgot('niemand')).status).toBe(200);
    expect((await forgot('johan')).status).toBe(429);
    expect(mails).toHaveLength(0);
    expect((await forgot('johan', { ip: '2.2.2.2' })).status).toBe(200);
  });

  it.each([
    ['Resend die Mail ablehnt', () => (resendStatus = 500)],
    ['der Schlüssel fehlt', () => delete env.RESEND_API_KEY],
    ['die Adresse fehlt', () => delete env.ADMIN_EMAIL],
  ])('lässt keinen Eintrag zurück, wenn %s, und erlaubt gleich den nächsten Versuch', async (_, breakIt) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const saved = { ...env };
    breakIt();
    expect((await forgot('johan')).status).toBe(200);
    expect(log).toHaveBeenCalled();
    expect(await storedResets()).toEqual([]);

    Object.assign(env, saved);
    resendStatus = 200;
    await forgot('johan');
    expect(mails).toHaveLength(1);
  });
});

describe('Neues Passwort setzen', () => {
  it('ersetzt das Passwort und meldet an', async () => {
    const response = await reset(await requestLink(), 'neues-passwort');
    expect(response.status).toBe(200);
    expect((await response.json()).user.username).toBe('johan');
    expect(response.headers.get('Set-Cookie')).toMatch(/HttpOnly/);
    expect((await post(syncApi, '/api/sync', {}, { cookie: cookieOf(response) })).status).toBe(200);

    expect((await tryLogin('neues-passwort')).status).toBe(200);
    expect((await tryLogin('geheim')).status).toBe(401);
  });

  it('meldet alle anderen Geräte ab', async () => {
    const other = cookieOf(await tryLogin('geheim'));
    expect((await post(syncApi, '/api/sync', {}, { cookie: other })).status).toBe(200);
    await reset(await requestLink(), 'neues-passwort');
    expect((await post(syncApi, '/api/sync', {}, { cookie: other })).status).toBe(401);
  });

  it('gilt nur einmal und macht andere offene Links des Kontos ungültig', async () => {
    const first = await requestLink();
    vi.setSystemTime(START + HOUR + 1);
    const second = await requestLink();
    expect(first).not.toBe(second);

    expect((await reset(second, 'neues-passwort')).status).toBe(200);
    expect((await reset(second, 'noch-eins')).status).toBe(400);
    expect((await reset(first, 'noch-eins')).status).toBe(400);
    expect((await tryLogin('neues-passwort')).status).toBe(200);
  });

  it('gilt genau 24 Stunden', async () => {
    const token = await requestLink();
    vi.setSystemTime(START + 24 * HOUR);
    const expired = await reset(token, 'neues-passwort');
    expect(expired.status).toBe(400);
    expect((await expired.json()).error).toMatch(/abgelaufen/);
    expect((await tryLogin('geheim')).status).toBe(200);
  });

  it('funktioniert kurz vor Ablauf noch', async () => {
    const token = await requestLink();
    vi.setSystemTime(START + 24 * HOUR - 1);
    expect((await reset(token, 'neues-passwort')).status).toBe(200);
  });

  it('verbraucht den Link nicht bei einem zu kurzen Passwort', async () => {
    const token = await requestLink();
    const tooShort = await reset(token, '123');
    expect(tooShort.status).toBe(400);
    expect((await tooShort.json()).error).toMatch(/mindestens 4/);
    expect((await reset(token, 'neues-passwort')).status).toBe(200);
  });

  it('lehnt falsche Links ab und zählt sie als Fehlversuche', async () => {
    for (const token of ['erfunden', undefined, 123]) expect((await reset(token, 'neues-passwort', { ip: '3.3.3.3' })).status).toBe(400);
    for (let i = 0; i < 7; i++) await reset('erfunden', 'neues-passwort', { ip: '3.3.3.3' });
    expect((await reset('erfunden', 'neues-passwort', { ip: '3.3.3.3' })).status).toBe(429);
    expect((await tryLogin('geheim')).status).toBe(200);
  });
});
