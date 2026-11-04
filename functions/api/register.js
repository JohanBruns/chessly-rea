// Neues Konto anlegen und direkt anmelden. Jeder kann sich selbst registrieren, ohne Bestätigung.
import { credentialsError, hashPassword, json, readJson, startSession } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const { username, password } = await readJson(request);
  const error = credentialsError(username, password);
  if (error) return json({ error }, 400);

  const user = await env.DB.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?) ON CONFLICT (username) DO NOTHING RETURNING id, username')
    .bind(username, await hashPassword(password), Date.now())
    .first();
  if (!user) return json({ error: 'Dieser Benutzername ist schon vergeben.' }, 409);

  return json({ user }, 201, { 'Set-Cookie': await startSession(request, env, user.id) });
}
