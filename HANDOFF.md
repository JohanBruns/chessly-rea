# Übergabe

**Stand (20.10.2026):** Alle Punkte aus `BACKLOG.md` sind umgesetzt, im Browser geprüft (Playwright) und committet
auf `feat/chessly-structure`. Tests: `npm test` (75 grün), Build: `npm run build`.

## Regeln (weiterhin gültig)

- **Keine Chessly-Inhalte übernehmen:** keine Varianten, Texte, Videos, Grafiken, Logos oder Code – nur Funktionen,
  Abläufe und Navigation.
- **Keine Passwörter eingeben.** Chessly nur im Browser-Fenster der App ansehen.
- **Testen:** eigene App auf localhost mit Playwright. Im Dev-Modus gibt es `window.__reaSession`
  (`playExpected()`, `state()`), um Sitzungen automatisch durchzuspielen.

## Mögliche nächste Schritte

- Weitere Repertoires in `openings/` (z. B. aus freien Lichess-Studien).
- Video-Kacheln mit eigenen Videos (`[Video "…"]`).
- Feinschliff: Sound-Optionen, Animation beim Freischalten einer Kachel.
