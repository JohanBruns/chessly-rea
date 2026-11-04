// Neues Konto anlegen und direkt anmelden. Das geht nur mit dem Einladungscode.
import { blockedResponse, recordFailure } from '../_lib/attempts.js';
import { credentialsError, hashPassword, inviteCodeValid, json, readJson, startSession } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const blocked = await blockedResponse(request, env);
  if (blocked) return blocked;

  const { username, password, inviteCode } = await readJson(request);
  // Zuerst der Code: Ohne ihn verrät die Antwort nichts darüber, welche Benutzernamen vergeben sind
  if (!(await inviteCodeValid(inviteCode, env))) {
    await recordFailure(request, env);
    return json({ error: 'Der Einladungscode stimmt nicht.' }, 403);
  }
  const error = credentialsError(username, password);
  if (error) return json({ error }, 400);

  const user = await env.DB.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?) ON CONFLICT (username) DO NOTHING RETURNING id, username')
    .bind(username, await hashPassword(password), Date.now())
    .first();
  if (!user) return json({ error: 'Dieser Benutzername ist schon vergeben.' }, 409);

  return json({ user }, 201, { 'Set-Cookie': await startSession(request, env, user.id) });
}
