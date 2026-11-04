import { beforeEach, describe, expect, it } from 'vitest';
import { onRequestPost as register } from '../functions/api/register.js';
import { onRequest as appFile } from '../functions/app/[[path]].js';
import { fakeD1 } from './helpers/fakeD1.js';

const ORIGIN = 'https://chessly-rea.pages.dev';
const URL_APP = `${ORIGIN}/app/app-abc.js`;
let env;
let assetRequests;

const get = (cookie, environment = env) => appFile({ env: environment, request: new Request(URL_APP, { headers: cookie ? { Cookie: cookie } : {} }) });

async function signUp() {
  const response = await register({
    env,
    request: new Request(`${ORIGIN}/api/register`, { method: 'POST', body: JSON.stringify({ username: 'johan', password: 'geheim', inviteCode: 'code' }) }),
  });
  return response.headers.get('Set-Cookie').split(';')[0];
}

beforeEach(() => {
  assetRequests = [];
  const ASSETS = {
    fetch: async (request) => {
      assetRequests.push(request.url);
      return new Response('kursinhalte', { headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'public, max-age=0' } });
    },
  };
  env = { DB: fakeD1(), INVITE_CODE: 'code', ASSETS };
});

describe('Geschützter App-Teil', () => {
  it('liefert ohne oder mit erfundener Anmeldung nichts aus', async () => {
    for (const cookie of [undefined, 'rea_session=erfunden']) {
      const response = await get(cookie);
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain('kursinhalte');
    }
    expect(assetRequests).toEqual([]);
  });

  it('bleibt ohne Datenbank zu', async () => {
    const response = await get('rea_session=egal', { ASSETS: env.ASSETS });
    expect(response.status).toBe(401);
    expect(assetRequests).toEqual([]);
  });

  it('liefert mit gültiger Anmeldung die Datei und nur für diesen Browser zwischenspeicherbar', async () => {
    const response = await get(await signUp());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('kursinhalte');
    expect(response.headers.get('Content-Type')).toBe('text/javascript');
    expect(response.headers.get('Cache-Control')).toMatch(/^private/);
    expect(assetRequests).toEqual([URL_APP]);
  });
});
