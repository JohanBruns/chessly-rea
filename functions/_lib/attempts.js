// Begrenzt Fehlversuche je Absender, damit sich weder Passwörter noch der Einladungscode durchprobieren lassen.
// Die Datei exportiert kein onRequest, Cloudflare macht daraus also keine Route.
import { json, sha256Hex } from './auth.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const attemptKey = (request) => sha256Hex(request.headers.get('CF-Connecting-IP') || 'unbekannt');

// Fertige Antwort, wenn dieser Absender gerade gesperrt ist, sonst null
export async function blockedResponse(request, env, now = Date.now()) {
  const row = await env.DB.prepare('SELECT failures FROM failed_attempts WHERE key = ? AND window_start > ?')
    .bind(await attemptKey(request), now - WINDOW_MS)
    .first();
  if (!row || row.failures < MAX_FAILURES) return null;
  return json({ error: 'Zu viele Fehlversuche. Versuche es in 15 Minuten noch einmal.' }, 429, { 'Retry-After': String(WINDOW_MS / 1000) });
}

// Zählt einen Fehlversuch. Alte Einträge räumt jeder neue Fehlversuch gleich mit weg.
export async function recordFailure(request, env, now = Date.now()) {
  const windowOpenSince = now - WINDOW_MS;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM failed_attempts WHERE window_start <= ?').bind(windowOpenSince),
    env.DB.prepare('INSERT INTO failed_attempts (key, failures, window_start) VALUES (?, 1, ?) ON CONFLICT (key) DO UPDATE SET failures = failures + 1').bind(await attemptKey(request), now),
  ]);
}
