# Chessly-REA – persönlicher Eröffnungstrainer

Ein eigener Nachbau des Chessly-Lernprinzips für die private Nutzung:

1. **Lernen** – Die Linie wird Zug für Zug gezeigt. Der eigene Zug ist mit einem grünen Pfeil markiert, die Erklärung steht daneben.
2. **Drillen** – Direkt danach spielst du die Linie aus dem Gedächtnis. Der Gegner zieht automatisch.
3. **Wiederholen** – Spaced Repetition (vereinfachtes SM-2): Fehlerfreie Linien kommen in wachsenden Abständen wieder (1 → 3 → 8 → 21 … Tage). Fehlerhafte Linien kommen sofort noch einmal dran.

Enthalten sind ein **Caro-Kann-Repertoire** (Schwarz) und ein **London-System-Repertoire** (Weiß). Weitere Eröffnungen lassen sich jederzeit hinzufügen.

## Starten

Doppelklick auf `start.cmd` – oder im Terminal:

```bash
npm install
npm run dev
```

Dann <http://localhost:5173> öffnen.

**Tastatur im Training:** `H` Hinweis · `R` Linie neu starten · `Enter` weiter · `Esc` beenden

## Weitere Eröffnungen hinzufügen

### Variante A: PGN-Datei in `openings/` legen (dauerhaft)

Jede `.pgn`-Datei im Ordner `openings/` wird beim Neuladen automatisch zu einem Kurs.

```pgn
[Course "Wiener Partie"]
[CourseDescription "Aggressives Repertoire gegen 1...e5."]
[Chapter "Hauptlinie mit 3.f4"]
[Orientation "white"]

{Einführungstext zum Kapitel.}
1. e4 e5 2. Nc3 {Erklärung zu diesem Zug.} Nf6 (2... Nc6 3. Bc4) 3. f4 *

[Chapter "Gegen 2...Bc5"]
[Orientation "white"]

1. e4 e5 2. Nc3 Bc5 3. Nf3 *
```

| Element | Bedeutung |
|---|---|
| Jede Partie (`[Chapter …]` … `*`) | ein **Kapitel** |
| Jede Variante `( … )` | eine eigene **Linie** (jeder Pfad bis zum Ende = eine Lernkarte) |
| `{Kommentar}` nach einem Zug | **Erklärung** im Lernmodus |
| `[Orientation "white"/"black"]` | welche Farbe du spielst |
| `[Course "…"]` (erste Partie) | Kursname (sonst Dateiname) |
| `{[%title Name]}` | eigener Name für die Linie(n) ab diesem Zug |
| `{[%cal Ge2e4]}`, `{[%csl Rd4]}` | Pfeile/Kreise auf dem Brett (wie bei Lichess) |

Tipp: Linien sollten mit **deinem eigenen Zug** enden.

### Variante B: Im Browser importieren

Über **„Hinzufügen“** in der App:

- **Lichess-Studie:** Link einfügen (`https://lichess.org/study/…`), dann „Laden“. Öffentliche Studien funktionieren direkt.
- **PGN-Datei** hochladen oder **PGN-Text** einfügen.

Importierte Kurse liegen im Browser-Speicher. Dauerhafter ist Variante A.

## Lernstand sichern

Der Lernstand liegt im `localStorage` des Browsers. Unter **Einstellungen → Sicherung herunterladen** exportierst du ihn als JSON und kannst ihn in einem anderen Browser wiederherstellen.

## Entwicklung

```bash
npm test        # Vitest: Parser, Kurs-Loader, Spaced Repetition, Trainingslogik, Repertoire-Dateien
npm run build   # statische Version in dist/
```

| Datei | Aufgabe |
|---|---|
| `src/pgnParser.js` | PGN → Zugbaum (Varianten, Kommentare, NAGs, Lichess-Annotationen) |
| `src/courseLoader.js` | Zugbaum → Kurs / Kapitel / Linien |
| `src/scheduler.js` | Spaced Repetition |
| `src/lineSession.js` | Ablauf einer Linie (Lernen/Drillen), ohne DOM |
| `src/courses.js` | lädt `openings/*.pgn` + Importe, stellt Trainings-Warteschlangen zusammen |
| `src/views/` | Startseite, Kurs, Training, Import, Einstellungen |

Brett: [chessground](https://github.com/lichess-org/chessground) (Lichess, GPL-3.0), Regeln: [chess.js](https://github.com/jhlywa/chess.js).
