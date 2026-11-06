// Konten und Anmeldung für die Pages Functions: Passwort-Hash, Sitzungs-Cookie, Eingabeprüfung.
// Die Datei exportiert kein onRequest, Cloudflare macht daraus also keine Route.

const COOKIE = 'rea_session';
const SESSION_MS = 365 * 24 * 60 * 60 * 1000;
// Im Gratis-Tarif hat ein Aufruf nur rund 10 ms Rechenzeit, deshalb weniger Runden als sonst üblich.
// Die Rundenzahl steht in jedem Hash und lässt sich später für neue Passwörter erhöhen.
const PBKDF2_ITERATIONS = 20000;
const MAX_PASSWORD_LENGTH = 200;

const encoder = new TextEncoder();
const toHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => Uint8Array.from(hex.match(/../g) || [], (pair) => parseInt(pair, 16));

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

// Fehlermeldung für die Anzeige oder null, wenn alles passt
export function passwordError(password) {
  if (typeof password !== 'string' || password.length < 4) return 'Das Passwort braucht mindestens 4 Zeichen.';
  if (password.length > MAX_PASSWORD_LENGTH) return `Das Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen haben.`;
  return null;
}

export function credentialsError(username, password) {
  if (typeof username !== 'string' || !/^[\p{L}\p{N}_.-]{3,32}$/u.test(username)) {
    return 'Der Benutzername braucht 3 bis 32 Zeichen: Buchstaben, Ziffern, Punkt, Minus oder Unterstrich.';
  }
  return passwordError(password);
}

// Zufallswert für Sitzungen und Links
export const randomToken = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iterations, salt, expected] = String(stored).split('$');
  if (scheme !== 'pbkdf2' || typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) return false;
  return toHex(await pbkdf2(password, fromHex(salt), Number(iterations))) === expected;
}

export const sha256Hex = async (text) => toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
const tokenHash = sha256Hex;

// Neue Konten gibt es nur mit dem Einladungscode (Secret INVITE_CODE). Ohne hinterlegten Code ist die Registrierung zu.
export async function inviteCodeValid(code, env) {
  if (!env.INVITE_CODE || typeof code !== 'string') return false;
  return (await sha256Hex(code.trim())) === (await sha256Hex(env.INVITE_CODE.trim()));
}

function sessionCookie(request, value, maxAgeSeconds) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function sessionToken(request) {
  const prefix = `${COOKIE}=`;
  const cookie = (request.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith(prefix));
  return cookie ? cookie.slice(prefix.length) : null;
}

// Legt die Sitzung an und liefert den Set-Cookie-Header. Alte Sitzungen räumt jede neue Anmeldung gleich mit weg.
export async function startSession(request, env, userId, now = Date.now()) {
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await tokenHash(token), userId, now + SESSION_MS),
  ]);
  return sessionCookie(request, token, SESSION_MS / 1000);
}

// Angemeldetes Konto ({ id, username }) oder null
export async function sessionUser(request, env, now = Date.now()) {
  const token = sessionToken(request);
  if (!token || !env.DB) return null;
  return env.DB.prepare('SELECT users.id AS id, users.username AS username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?')
    .bind(await tokenHash(token), now)
    .first();
}

// Löscht die Sitzung und liefert den Set-Cookie-Header, der das Cookie entfernt
export async function endSession(request, env) {
  const token = sessionToken(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await tokenHash(token)).run();
  return sessionCookie(request, '', 0);
}

// JSON-Body lesen; kaputte Anfragen ergeben ein leeres Objekt und scheitern dann an der Eingabeprüfung
export async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}
