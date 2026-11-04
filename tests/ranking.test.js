import { beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet as ranking } from '../functions/api/ranking.js';
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
      body: JSON.stringify(body),
    }),
  });

async function signUp(username) {
  const response = await post(register, '/api/register', { username, password: 'geheim' });
  return response.headers.get('Set-Cookie').split(';')[0];
}

async function player(username, xp) {
  const cookie = await signUp(username);
  if (xp !== undefined) await post(syncApi, '/api/sync', { base: {}, changes: { xp } }, cookie);
  return cookie;
}

const get = (cookie) => ranking({ env, request: new Request(`${ORIGIN}/api/ranking`, { headers: cookie ? { Cookie: cookie } : {} }) });
const fetchRanking = async (cookie) => (await get(cookie)).json();

beforeEach(() => {
  env = { DB: fakeD1() };
});

describe('Rangliste', () => {
  it('verlangt eine Anmeldung und wird nicht zwischengespeichert', async () => {
    expect((await get()).status).toBe(401);
    expect((await get('rea_session=erfunden')).status).toBe(401);
    const response = await get(await signUp('anna'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('sortiert alle Konten nach ihren gesamten XP und markiert das eigene', async () => {
    await player('anna', { total: 120, byDay: { '2026-01-05': 120 } });
    const ben = await player('ben', { total: 450, byDay: {} });
    await player('cleo', { total: 30, byDay: {} });

    const { players, entries } = await fetchRanking(ben);
    expect(players).toBe(3);
    expect(entries).toEqual([
      { rank: 1, username: 'ben', xp: 450, me: true },
      { rank: 2, username: 'anna', xp: 120, me: false },
      { rank: 3, username: 'cleo', xp: 30, me: false },
    ]);
  });

  it('zählt die XP aller Zeiten, nicht nur die der aktuellen Woche', async () => {
    const cookie = await player('anna', { total: 900, byDay: { '2020-01-06': 900 } });
    expect((await fetchRanking(cookie)).entries[0].xp).toBe(900);
  });

  it('führt Konten ohne XP mit 0 auf und gibt bei Gleichstand denselben Platz', async () => {
    await player('anna', { total: 50, byDay: {} });
    await player('Ben', { total: 50, byDay: {} });
    const neu = await player('cleo');

    const { entries } = await fetchRanking(neu);
    expect(entries.map((e) => [e.rank, e.username, e.xp])).toEqual([
      [1, 'anna', 50],
      [1, 'Ben', 50],
      [3, 'cleo', 0],
    ]);
  });

  it('übernimmt neu abgeglichene XP sofort', async () => {
    const cookie = await player('anna', { total: 10, byDay: {} });
    await post(syncApi, '/api/sync', { base: { xp: 1 }, changes: { xp: { total: 25, byDay: {} } } }, cookie);
    expect((await fetchRanking(cookie)).entries[0].xp).toBe(25);
  });

  it('wertet unbrauchbare XP-Stände als 0', async () => {
    await player('anna', { total: 'viel' });
    await player('ben', { total: -5 });
    const cookie = await player('cleo', 'kein objekt');
    const { entries } = await fetchRanking(cookie);
    expect(entries.every((e) => e.xp === 0)).toBe(true);
  });

  it('gibt keine Konto-IDs oder anderen Daten heraus', async () => {
    const cookie = await player('anna', { total: 10, byDay: { '2026-01-05': 10 } });
    expect(Object.keys((await fetchRanking(cookie)).entries[0]).sort()).toEqual(['me', 'rank', 'username', 'xp']);
  });

  it('zeigt die besten 100 und das eigene Konto auch weiter hinten', async () => {
    for (let i = 0; i < 101; i += 1) {
      await env.DB.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').bind(`spieler${i}`, 'x', 0).run();
      await env.DB.prepare("INSERT INTO user_data (user_id, key, value, version, updated_at) SELECT id, 'xp', ?, 1, 0 FROM users WHERE username = ?")
        .bind(JSON.stringify({ total: 1000 + i }), `spieler${i}`)
        .run();
    }
    const cookie = await player('letzter', { total: 1, byDay: {} });

    const { players, entries } = await fetchRanking(cookie);
    expect(players).toBe(102);
    expect(entries).toHaveLength(101);
    expect(entries[0].username).toBe('spieler100');
    expect(entries.at(-1)).toEqual({ rank: 102, username: 'letzter', xp: 1, me: true });
  });
});
