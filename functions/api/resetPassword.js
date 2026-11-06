// Neues Passwort über den Link aus „Passwort vergessen“ setzen. Danach ist dieses Gerät angemeldet, alle anderen abgemeldet.
import { blockedResponse, recordFailure } from '../_lib/attempts.js';
import { hashPassword, json, passwordError, readJson, sha256Hex, startSession } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const blocked = await blockedResponse(request, env);
  if (blocked) return blocked;

  const { token, password } = await readJson(request);
  // Vor dem Link prüfen: Ein zu kurzes Passwort soll den Link nicht verbrauchen
  const error = passwordError(password);
  if (error) return json({ error }, 400);
  const passwordHash = await hashPassword(password);

  // Das Löschen entscheidet: So gilt der Link auch bei zwei gleichzeitigen Aufrufen nur einmal
  const reset =
    typeof token === 'string'
      ? await env.DB.prepare('DELETE FROM password_resets WHERE token_hash = ? AND expires_at > ? RETURNING user_id').bind(await sha256Hex(token), Date.now()).first()
      : null;
  if (!reset) {
    await recordFailure(request, env);
    return json({ error: 'Dieser Link ist ungültig, abgelaufen oder wurde schon benutzt. Fordere auf der Anmeldeseite einen neuen an.' }, 400);
  }

  const user = await env.DB.prepare('SELECT id, username FROM users WHERE id = ?').bind(reset.user_id).first();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(passwordHash, user.id),
    env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
  ]);
  return json({ user }, 200, { 'Set-Cookie': await startSession(request, env, user.id) });
}
