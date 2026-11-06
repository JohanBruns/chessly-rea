-- Warteschlange der Kurse, die Konten im Chessly-Katalog hinzufügen. downloader/queue_worker.py arbeitet sie auf dem PC ab.
-- Pro Kurs gibt es höchstens eine Zeile; alle Konten sehen denselben Stand.
CREATE TABLE course_requests (
  chessly_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  message TEXT,
  requested_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  requested_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX course_requests_queue ON course_requests (status, requested_at);
