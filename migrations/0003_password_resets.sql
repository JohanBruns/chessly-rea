-- Einmalige Links für „Passwort vergessen“. Im Link steht ein Zufallswert, hier nur sein SHA-256.
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX password_resets_user_id ON password_resets (user_id);
CREATE INDEX password_resets_expires_at ON password_resets (expires_at);
