# Chessly-REA – persönlicher Eröffnungstrainer

Ein eigener Nachbau der Lernlogik und Navigation von Chessly für die private Nutzung – mit eigenem Design
(dunkles Navy mit Türkis, eigenes Logo, eigene Kachelgrafik) und eigenen Repertoires.

## So lernst du

1. **Kurs → Kapitel → Study.** Jeder Kurs hat Kapitel (Akkordeon), jedes Kapitel mehrere Studies.
2. **Lernpfad aus Kacheln.** Jede Study hat einen Pfad aus isometrischen Kacheln: optional ein Video,
   Lern-Kacheln (je 2 Varianten) und am Ende eine Drill-Kachel. Kacheln werden nacheinander freigeschaltet.
3. **Lern-Kachel.** Pro Variante erst **Lernen** (Pfeil + Kommentar, falsche Züge springen still zurück),
   dann „Variante abgeschlossen!“ mit *Nochmal* oder *Weiter zur Wiederholung*, dann **Wiederholen** aus dem
   Gedächtnis (+5 XP). Der Fortschrittsbalken hat 2 Segmente pro Variante.
4. **Hinweis in 2 Stufen.** Der 1. Klick markiert die Figur (Button heißt dann „Lösung“), der 2. Klick zeigt
   Pfeil und Kommentar. Falsche Züge bekommen ein rotes Minus-Abzeichen und werden zurückgesetzt.
5. **Drill-Kachel.** Alle Varianten der Study gemischt (+10 XP). Varianten mit Fehlern kommen am Ende noch einmal.
6. **Wiederholen.** Spaced Repetition (vereinfachtes SM-2): Gelernte Varianten werden in wachsenden Abständen
   fällig (Menü → *Wiederholen*).

Außerdem: **Drill Shuffle** (Kurs wählen, Varianten zufällig), **Gegen den Bot** (Repertoire-Züge, danach
Stockfish), **Study-Linien-Explorer** (Klick auf den Study-Titel), **Kurs-Explorer** (freies Brett mit Kurszügen),
**XP, Level, Streak** und eine persönliche **Wochenliga** im Profil.

Enthalten sind ein **Caro-Kann-Repertoire** (Schwarz) und ein **London-System-Repertoire** (Weiß).

## Starten

Doppelklick auf `start.cmd` – oder im Terminal:

```bash
npm install
```

```bash
npm run dev
```

Dann <http://localhost:5173> öffnen. `npm install` kopiert die Stockfish-Engine (Lite, WASM) nach `public/stockfish/`.

**Tastatur in Sitzungen:** `←`/`→` Züge zurück/vor (nur bis zur aktuellen Stellung) · `Pos1`/`Ende` · `H` Hinweis ·
`Enter` weiter · `Esc` zurück zum Pfad

## Navigation

| Ansicht | Adresse |
|---|---|
| Home („Hallo, Name“, Level, XP-Diagramm, aktueller Kurs) | `#/` |
| Alle Kurse (Suche, Filter Weiß/Schwarz/Importiert) | `#/courses` |
| Kursseite (Kapitel, Studies, Lernpfade, Bot/Drill/Wiederholen) | `#/course/<kurs>` |
| Kachel-Sitzung | `#/course/<kurs>/tile/<kachel>` |
| Study-Linien-Explorer | `#/course/<kurs>/study/<study>` |
| Wiederholen · Drill Shuffle · Bot | `#/review` · `#/drill` · `#/bot` |
| Profil · Einstellungen · Hinzufügen | `#/profile` · `#/settings` · `#/import` |

Das Menü (Hamburger oben rechts) enthält alle Bereiche und den Schalter für Dunkel/Hell. Die Flamme zeigt die
Streak; ein Klick öffnet die Wochenleiste.

## Eigene Eröffnungen hinzufügen

### Variante A: PGN-Datei in `openings/` legen (dauerhaft)

Jede `.pgn`-Datei im Ordner `openings/` wird beim Neuladen automatisch zu einem Kurs. **Jede PGN-Partie ist eine
Study**, `[Chapter]` fasst Studies zu Kapiteln zusammen.

```pgn
[Course "Wiener Partie"]
[CourseDescription "Aggressives Repertoire gegen 1...e5."]
[CourseIcon "Nc3"]
[CourseHue "200"]
[Chapter "Hauptlinie mit 3.f4"]
[ChapterDescription "Weiß greift sofort mit f4 an."]
[Study "Gegen 2...Nf6"]
[Orientation "white"]

{Einführungstext zur Study.}
1. e4 e5 2. Nc3 {Erklärung zu diesem Zug.} Nf6 (2... Nc6 3. Bc4) 3. f4 *
```

| Element | Bedeutung |
|---|---|
| `[Course]`, `[CourseDescription]` (erste Partie) | Kursname und Beschreibung |
| `[CourseIcon "Bf4"]`, `[CourseHue "355"]` | Figur und Farbton des generierten Kurs-Icons |
| `[Chapter]`, `[ChapterDescription]` | Kapitel, zu dem die Study gehört |
| `[Study]` | Titel der Study (sonst Lichess-Kapitelname) |
| `[Video "https://…"]` oder `[Video "/downloader/downloads/…mp4"]` | optionale Video-Kachel am Anfang des Pfads (Link oder lokales Video aus dem Downloader) |
| `[Orientation "white"/"black"]` | welche Farbe du spielst |
| Jede Variante `( … )` | eine eigene **Variante** (jeder Pfad bis zum Ende) |
| `{Kommentar}` nach einem Zug | Erklärung beim Lernen |
| `{[%title Name]}` | eigener Name für die Variante(n) ab diesem Zug |
| `{[%cal Ge2e4]}`, `{[%csl Rd4]}` | Pfeile/Kreise auf dem Brett (wie bei Lichess) |

Tipp: Varianten sollten mit **deinem eigenen Zug** enden; der Kommentar des letzten Zugs erscheint bei
„Variante abgeschlossen!“, seine Pfeile zeigen den Plan.

### Variante B: Im Browser importieren

Über **Menü → Hinzufügen**: Lichess-Studie per Link, PGN-Datei oder PGN-Text. Importierte Kurse liegen im
Browser-Speicher.

## Kursvideos herunterladen (`downloader/`)

Im Ordner `downloader/` liegt ein kleines Python-Tool, das alle Lektionsvideos eines Chessly-Kurses als MP4
lädt (mit deinem eigenen Chessly-Login). Einmal `downloader\setup.bat`, danach `downloader\start.bat`.
Details in [downloader/README.md](downloader/README.md).

Caro-Kann und London-System sind schon verknüpft: Jede Study hat einen `[Video]`-Eintrag auf ihre MP4 in
`downloader/downloads/`. Ein Klick auf die Video-Kachel öffnet das Video (nur mit `npm run dev` bzw. `start.cmd`,
weil der Dev-Server die Dateien ausliefert; die Videos selbst sind nicht in Git).

## Abgleich mit Chessly

Passen deine Studies zu dem, was im Video besprochen wird? `downloader\lines.py` speichert Kapitel, Studies und
alle Varianten (Züge + Kommentare) eines Chessly-Kurses in `downloader/lines/<Kurs>.json`:

```bash
downloader\.venv\Scripts\python downloader\lines.py https://chessly.com/courses/d4f3504b-8bbd-4435-ae30-a0b8372c9286
```

Danach vergleicht `npm run abgleich` jede PGN-Datei mit `[ChesslyCourse "<Kurs-ID>"]`-Header mit diesen Linien und
schreibt `downloader/lines/<Kurs> - Abgleich.md`: pro Study, welche Chessly-Varianten vollständig enthalten sind,
wo du einen anderen eigenen Zug spielst, welcher Gegnerzug fehlt und welche Linien nur bei dir stehen.
Kapitel und Studies werden in ihrer Reihenfolge zugeordnet.

## Lernstand sichern

Lernstand, XP und Streak liegen im `localStorage` des Browsers. Unter **Einstellungen → Sicherung herunterladen**
exportierst du alles als JSON und kannst es in einem anderen Browser wiederherstellen. Dort lässt sich auch der
Fortschritt einzelner Kurse zurücksetzen.

## Entwicklung

```bash
npm test
```

```bash
npm run build
```

| Datei | Aufgabe |
|---|---|
| `src/pgnParser.js` | PGN → Zugbaum (Varianten, Kommentare, NAGs, Lichess-Annotationen) |
| `src/courseLoader.js` | Zugbaum → Kurs / Kapitel / Study / Varianten / Kacheln, Stellungsindex |
| `src/progress.js` | Kachel-Freischaltung, Kursfortschritt, Level, Streak, Wochenliga |
| `src/lineSession.js` | Ablauf einer Variante (Lernen/Wiederholen, Hinweis-Stufen, Navigation), ohne DOM |
| `src/tileSession.js` | Ablauf einer Kachel (Lernen + Wiederholen je Variante, gemischter Drill), ohne DOM |
| `src/scheduler.js` | Spaced Repetition |
| `src/courseCompare.js`, `scripts/compareCourse.js` | Abgleich eines Kurses mit den Chessly-Linien (`npm run abgleich`) |
| `src/bot.js`, `src/engine.js` | Repertoire-Züge des Bots, Stockfish als Web Worker |
| `src/ui/` | Topbar & Menü, Icons & Logo, Kurs-Icons, Kachelpfad (SVG), XP-Diagramm, Toasts |
| `src/views/` | Home, Kurse, Kursseite, Sitzung, Explorer, Drill Shuffle, Wiederholen, Bot, Profil, Einstellungen, Import |
| `downloader/` | Python-Tool (tkinter, Playwright, yt-dlp) zum Herunterladen der Chessly-Kursvideos |

Brett: [chessground](https://github.com/lichess-org/chessground) (Lichess, GPL-3.0), Regeln:
[chess.js](https://github.com/jhlywa/chess.js), Engine: [stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL-3.0).
