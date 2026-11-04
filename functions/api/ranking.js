// Rangliste aller Konten nach ihren gesamten XP. Gleich viele XP ergeben denselben Platz.
import { json, sessionUser } from '../_lib/auth.js';

const MAX_ENTRIES = 100;

const RANKING = `SELECT id, username, xp, RANK() OVER (ORDER BY xp DESC) AS place FROM (
    SELECT users.id, users.username, MAX(0, COALESCE(CAST(json_extract(user_data.value, '$.total') AS INTEGER), 0)) AS xp
    FROM users LEFT JOIN user_data ON user_data.user_id = users.id AND user_data.key = 'xp'
  )
  ORDER BY xp DESC, username COLLATE NOCASE`;

export async function onRequestGet({ request, env }) {
  const user = await sessionUser(request, env);
  if (!user) return json({ error: 'Nicht angemeldet' }, 401);

  const { results } = await env.DB.prepare(RANKING).all();
  // Das eigene Konto ist immer dabei, auch hinter den besten 100
  const shown = results.filter((row, index) => index < MAX_ENTRIES || row.id === user.id);
  return json({
    players: results.length,
    entries: shown.map((row) => ({ rank: row.place, username: row.username, xp: row.xp, me: row.id === user.id })),
  });
}
