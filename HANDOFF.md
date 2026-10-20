# Übergabe für eine neue Sitzung

**Ziel:** Die App in diesem Ordner so ausbauen, dass sie die Logik und Navigation von Chessly (chessly.com) nachbildet. Sie soll sich für Chessly-Nutzer vertraut anfühlen, aber nicht gleich aussehen: ähnlicher Stil, eigenes Design. Johan ist auf Chessly mit dem eigenen Account im Browser-Fenster der App angemeldet. Wenn alles fertig ist, Bescheid geben.

## Kontext

- **Projekt:** Persönlicher Eröffnungstrainer mit Vite + Vanilla-JS, chess.js, @lichess-org/chessground und Vitest. Start mit `npm run dev`, dann http://localhost:5173. Tests mit `npm test`.
- **Git:** Gearbeitet wird auf dem Branch `feat/chessly-structure`. `main` ist der Ursprungsstand. Commits im Conventional-Format.
- **Zuerst lesen:** `BACKLOG.md`. Dort steht die komplette Chessly-Analyse (nur Funktionen und Abläufe) mit Checkliste. Erledigte Punkte dort abhaken.

## Regeln

- **Keine Chessly-Inhalte übernehmen:** keine Varianten, Texte, Videos, Grafiken, Logos oder Code. Nur Funktionen, Abläufe und Navigation nachbauen. Repertoires schreiben wir selbst oder holen sie aus freien PGN-Quellen.
- **Keine Passwörter eingeben:** Chessly nur im Browser-Fenster der App ansehen, wo Johan schon angemeldet ist. Nichts massenhaft automatisch abgreifen.
- **Testen:** Für unsere eigene App auf localhost den Playwright-MCP (`.mcp.json`) verwenden.

## Stand (fertig, alle 43 Tests grün)

- **`src/courseLoader.js`:** Aufbau Kurs → Kapitel → Study → Varianten. Jede PGN-Partie ist eine Study, `[Chapter "…"]` gruppiert die Studies. Weitere Header: `[Study]`, `[Video]`, `[CourseIcon]`, `[CourseHue]`, `[ChapterDescription]`. Jede Study hat Kacheln (tiles): `video` (optional), `learn` (je 2 Varianten), `drill` (alle Varianten). Dazu kommen `buildPositionIndex` und `positionKey` für den Course Explorer.
- **Repertoires:** `openings/caroKann.pgn` (Schwarz) und `openings/londonSystem.pgn` (Weiß), je 5 Kapitel mit Studies.
- **`src/storage.js`:** Speichert Lernstand (SRS-Karten), XP (`total`, `byDay`), Pfad-Status (`drills`, `videos`, `lastCourse`, `started`), Einstellungen (`name`, `boardTheme`, `theme`, `engineSkill` …) und das Backup v2.
- **`src/progress.js`** (neu, noch ohne Tests):
  - `tileStates`: Kacheln werden nacheinander freigeschaltet. Das Video blockiert nichts. Eine Lern-Kachel ist fertig, wenn alle ihre Varianten `reps ≥ 1` haben.
  - Außerdem: `courseProgress`, `nextTile`, `findTile`, `levelInfo` (Level n ab 50·n·(n−1) XP), `streakInfo`, `xpLastDays`, `weeklyLeague` (`LEAGUES`) und die XP-Werte.
- **Weiterhin vorhanden:** `pgnParser.js`, `scheduler.js` (SM-2), `lineSession.js`, `board.js`, `sound.js`, `dom.js`, `courses.js` und die alten Views in `src/views/`. Diese nutzen die neue Struktur **noch nicht**.

## Nächste Schritte

1. **Tests für `progress.js`** schreiben.
2. **`lineSession` erweitern:**
   - Hinweis in 2 Stufen: Der 1. Klick markiert die Figur, der Button heißt dann „Lösung“. Der 2. Klick zeigt Pfeil und Kommentar.
   - Falscher Zug im Wiederholen: rotes Minus-Abzeichen an der Figur, dann zurücksetzen. Im Lernen falsche Züge still zurücksetzen.
   - Brett-Navigation (Anfang, zurück, vor, Ende), aber nur bis zur aktuellen Stellung.
3. **Layout wie bei Chessly:**
   - Topbar: Logo links. Rechts die Streak-Flamme mit Zähler (Popover mit Wochenleiste), Avatar und Hamburger.
   - Menü als Overlay: Profil, Home, Alle Kurse, Wiederholen, Drill Shuffle, Gegen den Bot, Einstellungen, Hinzufügen, Theme-Schalter.
   - Dunkles Navy-Theme mit Türkis-Akzent (nicht Chesslys Pink), eigenes Logo.
4. **Home:** „Hallo, <Name>“, Level-Pille mit XP, XP-Diagramm der letzten 7 Tage, aktueller Kurs mit dem Kapitel der nächsten Kachel und dessen Pfad, Karte mit fälligen Wiederholungen.
5. **Kursübersicht** (`#/courses`): Suche, Filter-Chips (Alle/Weiß/Schwarz/Importiert), Kurskarten mit generiertem Icon (CourseIcon + Farbton), Beschreibung, Button „Kurs starten/Weiter“, Fortschritt.
6. **Kursseite:**
   - Kopf: Icon, Titel, Button „Kurs-Explorer“, Beschreibung, Fortschritt in %.
   - Kapitel als Akkordeon. Pro Study eine Kopfleiste „STUDY n Titel“: Ein Klick öffnet den Linien-Explorer, −/+ klappt ein und aus.
   - Darunter der Pfad aus isometrischen Kacheln im Zickzack (SVG). Zustände gesperrt/verfügbar/fertig, Icons Play/Buch/Shuffle/Schloss.
   - Seitenleiste mit Karten: Bot, Drill Shuffle, Wiederholen.
7. **Kachel-Sitzung:**
   - Kopf mit Kurs-Icon, Titel und „Kapitel N Name“.
   - Banner „Variante 1 von 2“ mit „…“-Menü (Position analysieren → lichess.org/analysis/<FEN>, Zurück zum Pfad, Video ansehen) und Hinweis-Button.
   - Segmentierter Fortschrittsbalken mit 2 Segmenten pro Variante (Lernen, Wiederholen).
   - Ablauf pro Variante:
     1. Lernen mit Pfeil und Kommentar.
     2. „Variante abgeschlossen!“ mit den Buttons „Nochmal“ und „Weiter zur Wiederholung“.
     3. Wiederholen ohne Kommentar.
     4. +5 XP, dann die nächste Variante.
   - Ist die Kachel fertig, geht es zurück zum Pfad.
   - Bei der Drill-Kachel werden alle Varianten gemischt abgefragt (+10 XP).
8. **Study-Linien-Explorer:** Brett, Navigation und eine Karte „nächster Zug“ mit Chips für die passenden Varianten.
9. **Course Explorer** als Dialog: freies Brett, Schalter „Kurszüge anzeigen“ (Pfeile), Zugliste, passende Studies (positionIndex).
10. **Drill Shuffle:** Kurs wählen, dann Varianten zufällig drillen. Die Spaced-Repetition-Wiederholung (`#/review`) bleibt erhalten.
11. **Bot:** spielt zuerst Züge aus dem Repertoire, danach Stockfish (npm-Paket `stockfish`, als Web Worker).
12. **Profil und Einstellungen:**
    - Profil: Name, XP, Level, Streak, persönliche Wochenliga.
    - Einstellungen: Brettfarben brown/blue/green, Dunkel/Hell, Fortschritt pro Kurs zurücksetzen, Backup.
13. **Abschluss:** Jede Ansicht mit Playwright im Browser prüfen, Tests grün halten, Build prüfen, README aktualisieren, committen.
