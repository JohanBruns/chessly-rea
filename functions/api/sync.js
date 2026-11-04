// Lernstand abgleichen. Das Gerät schickt seine Stände (base) und geänderte Daten (changes).
// Eine Änderung wird nur gespeichert, wenn base noch dem Server entspricht. Sonst hat ein anderes Gerät
// dazwischen gespeichert: Das Gerät bekommt den Serverstand in updates, führt beides zusammen und schickt es erneut.
import { json, readJson, sessionUser } from '../_lib/auth.js';

const SYNC_KEYS = new Set(['progress', 'state', 'xp', 'settings', 'imported']);
// D1 erlaubt höchstens 2 MB pro Wert
const MAX_VALUE_LENGTH = 1_500_000;

const UPSERT = `INSERT INTO user_data (user_id, key, value, version, updated_at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, version = excluded.version, updated_at = excluded.updated_at
  WHERE user_data.version = ?`;

export async function onRequestPost({ request, env }) {
  const user = await sessionUser(request, env);
  if (!user) return json({ error: 'Nicht angemeldet' }, 401);

  const body = await readJson(request);
  const base = body.base && typeof body.base === 'object' ? body.base : {};
  const changes = body.changes && typeof body.changes === 'object' ? body.changes : {};

  const accepted = {};
  const tooLarge = [];
  for (const [key, value] of Object.entries(changes)) {
    if (!SYNC_KEYS.has(key)) continue;
    const text = JSON.stringify(value);
    if (text === undefined) continue;
    if (text.length > MAX_VALUE_LENGTH) {
      tooLarge.push(key);
      continue;
    }
    const baseVersion = Number(base[key]) || 0;
    const result = await env.DB.prepare(UPSERT).bind(user.id, key, text, baseVersion + 1, Date.now(), baseVersion).run();
    if (result.meta.changes > 0) accepted[key] = baseVersion + 1;
  }

  const { results } = await env.DB.prepare('SELECT key, value, version FROM user_data WHERE user_id = ?').bind(user.id).all();
  const updates = {};
  for (const row of results) {
    const known = accepted[row.key] ?? (Number(base[row.key]) || 0);
    if (row.version !== known) updates[row.key] = { version: row.version, value: JSON.parse(row.value) };
  }
  return json({ accepted, updates, tooLarge });
}
