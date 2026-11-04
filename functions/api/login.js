// Mit Benutzername und Passwort anmelden.
import { json, readJson, startSession, verifyPassword } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const { username, password } = await readJson(request);
  const row =
    typeof username === 'string' ? await env.DB.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').bind(username).first() : null;
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return json({ error: 'Benutzername oder Passwort stimmt nicht.' }, 401);
  }
  return json({ user: { id: row.id, username: row.username } }, 200, { 'Set-Cookie': await startSession(request, env, row.id) });
}
