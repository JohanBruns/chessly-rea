// Mit Benutzername und Passwort anmelden.
import { blockedResponse, recordFailure } from '../_lib/attempts.js';
import { json, readJson, startSession, verifyPassword } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const blocked = await blockedResponse(request, env);
  if (blocked) return blocked;

  const { username, password } = await readJson(request);
  const row =
    typeof username === 'string' ? await env.DB.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').bind(username).first() : null;
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    await recordFailure(request, env);
    return json({ error: 'Benutzername oder Passwort stimmt nicht.' }, 401);
  }
  return json({ user: { id: row.id, username: row.username } }, 200, { 'Set-Cookie': await startSession(request, env, row.id) });
}
