-- Fehlversuche bei Anmeldung und Einladungscode je Absender. key ist der SHA-256 der IP-Adresse, nicht die Adresse selbst.
CREATE TABLE failed_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
CREATE INDEX failed_attempts_window_start ON failed_attempts (window_start);
