-- Konten, Anmeldungen und Lernstand pro Konto.
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Im Cookie steht ein Zufallswert, hier nur sein SHA-256.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expires_at ON sessions (expires_at);

-- Je Konto eine Zeile pro Datenart (progress, state, xp, settings, imported) als JSON.
-- version zählt jede Änderung hoch und erkennt, wenn ein anderes Gerät dazwischen gespeichert hat.
CREATE TABLE user_data (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
