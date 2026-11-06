// „Passwort vergessen“: Konten haben keine E-Mail-Adresse, deshalb geht der einmalige Link an den Admin (ADMIN_EMAIL).
// Die Antwort ist immer gleich, damit sich nicht erkennen lässt, welche Benutzernamen es gibt.
import { blockedResponse, recordFailure } from '../_lib/attempts.js';
import { json, randomToken, readJson, sha256Hex } from '../_lib/auth.js';

const LINK_VALID_MS = 24 * 60 * 60 * 1000;
// Resend erlaubt 100 Mails am Tag; so lässt sich damit weder das Kontingent aufbrauchen noch das Postfach fluten
const MAIL_INTERVAL_MS = 60 * 60 * 1000;

function resetMail(username, link) {
  return {
    subject: `Chessly-REA: Passwort-Link für „${username}“`,
    text: [
      `Für das Konto „${username}“ wurde auf der Anmeldeseite „Passwort vergessen“ gewählt.`,
      '',
      'Mit diesem Link lässt sich 24 Stunden lang einmalig ein neues Passwort setzen:',
      link,
      '',
      'Ist es dein Konto, öffne den Link selbst. Sonst leite ihn nur weiter, wenn du sicher weißt, dass die Person wirklich danach gefragt hat: Wer den Link hat, kann das Konto übernehmen.',
      '',
      'Hat niemand danach gefragt, ignoriere diese Mail. Das Passwort bleibt dann, wie es ist.',
    ].join('\n'),
  };
}

async function sendMail(env, { subject, text }) {
  if (!env.RESEND_API_KEY || !env.ADMIN_EMAIL) throw new Error('RESEND_API_KEY oder ADMIN_EMAIL fehlt');
  // Ohne eigene Domain erlaubt Resend nur den Absender onboarding@resend.dev und nur an die eigene Konto-Adresse
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Chessly-REA <onboarding@resend.dev>', to: [env.ADMIN_EMAIL], subject, text }),
  });
  if (!response.ok) throw new Error(`Resend lehnt die Mail ab: ${response.status}`);
}

// Scheitert die Mail, fällt auch die Sperre für die nächste Anfrage weg, sonst ginge eine Stunde lang gar nichts
async function deliver(env, tokenHash, mail) {
  try {
    await sendMail(env, mail);
  } catch (err) {
    console.error('Passwort-Link nicht verschickt:', err.message);
    await env.DB.prepare('DELETE FROM password_resets WHERE token_hash = ?').bind(tokenHash).run();
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  const blocked = await blockedResponse(request, env);
  if (blocked) return blocked;
  // Jede Anfrage zählt mit, auch eine erfolgreiche: So lassen sich weder Namen durchprobieren noch Mails auslösen
  await recordFailure(request, env);

  const { username } = await readJson(request);
  const user = typeof username === 'string' ? await env.DB.prepare('SELECT id, username FROM users WHERE username = ?').bind(username.trim()).first() : null;
  if (user) {
    const now = Date.now();
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare('DELETE FROM password_resets WHERE expires_at <= ?').bind(now).run();
    const { meta } = await env.DB.prepare(
      'INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM password_resets WHERE user_id = ? AND created_at > ?)',
    )
      .bind(tokenHash, user.id, now, now + LINK_VALID_MS, user.id, now - MAIL_INTERVAL_MS)
      .run();
    if (meta.changes) {
      const link = `${new URL(request.url).origin}/#/passwort-neu?token=${token}`;
      // Im Hintergrund, damit die Antwortzeit nicht verrät, ob es das Konto gibt
      waitUntil(deliver(env, tokenHash, resetMail(user.username, link)));
    }
  }
  return json({ ok: true });
}
