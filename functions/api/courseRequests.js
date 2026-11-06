// Kurse aus dem Chessly-Katalog hinzufügen: Jedes Konto kann einen Kurs in die Warteschlange legen und alle sehen den Stand.
// Laden und Veröffentlichen übernimmt downloader/queue_worker.py auf dem PC, denn nur dort liegt der Chessly-Login.
import catalog from '../../downloader/catalog.json';
import { json, readJson, sessionUser } from '../_lib/auth.js';

// Ein Kurs kostet Stunden und Gigabytes, deshalb kann ein Konto nicht beliebig viele auf einmal anstoßen.
const MAX_OPEN_PER_USER = 3;

const SELECT_REQUEST = 'SELECT chessly_id AS id, status, message FROM course_requests';

export async function onRequestGet({ request, env }) {
  if (!(await sessionUser(request, env))) return json({ error: 'Nicht angemeldet' }, 401);
  const { results } = await env.DB.prepare(SELECT_REQUEST).all();
  return json({ requests: results });
}

export async function onRequestPost({ request, env }) {
  const user = await sessionUser(request, env);
  if (!user) return json({ error: 'Nicht angemeldet' }, 401);

  // Name und Link kommen aus dem Katalog, nie aus der Anfrage: Der PC lädt nur, was im Katalog steht.
  const { courseId } = await readJson(request);
  const course = catalog.courses.find((entry) => entry.id === courseId);
  if (!course) return json({ error: 'Diesen Kurs gibt es im Chessly-Katalog nicht.' }, 404);
  if (course.comingSoon) return json({ error: 'Dieser Kurs ist bei Chessly noch nicht erschienen.' }, 409);

  const select = env.DB.prepare(`${SELECT_REQUEST} WHERE chessly_id = ?`).bind(course.id);
  const existing = await select.first();
  if (existing && existing.status !== 'failed') return json({ request: existing });

  const { open } = await env.DB.prepare("SELECT COUNT(*) AS open FROM course_requests WHERE requested_by = ? AND status IN ('queued', 'running')")
    .bind(user.id)
    .first();
  if (open >= MAX_OPEN_PER_USER) {
    return json({ error: `Du hast schon ${MAX_OPEN_PER_USER} Kurse in Arbeit. Warte, bis einer davon fertig ist.` }, 429);
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO course_requests (chessly_id, name, url, status, requested_by, requested_at, updated_at)
     VALUES (?, ?, ?, 'queued', ?, ?, ?)
     ON CONFLICT (chessly_id) DO UPDATE SET status = 'queued', message = NULL, requested_by = excluded.requested_by,
       requested_at = excluded.requested_at, updated_at = excluded.updated_at
     WHERE course_requests.status = 'failed'`,
  )
    .bind(course.id, course.name, course.url, user.id, now, now)
    .run();
  return json({ request: await select.first() });
}
