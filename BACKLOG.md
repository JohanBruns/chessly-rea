# Backlog: Chessly-Logik in Chessly-REA

Analyse der Chessly-Web-App (eigener Account, Oktober 2026) – festgehalten werden **nur Funktionen,
Abläufe und Navigation**, keine Kursinhalte, Texte, Grafiken oder Code.

## Beobachtete Struktur

| Chessly | Beobachtung | Umsetzung bei uns |
|---|---|---|
| **Kurs → Kapitel → Study → Variationen** | Kapitel als Akkordeon, jede Study hat einen eigenen Lernpfad | PGN-Header `[Chapter]` gruppiert, jede PGN-Partie = eine Study |
| **Lernpfad aus Kacheln** | Isometrische Kacheln im Zickzack: Video → Lern-Kachel(n) → gesperrte Kacheln | Pfad pro Study: optional Video, Lern-Kacheln (je bis zu 2 Variationen), abschließende Drill-Kachel |
| **Freischalten** | Kacheln werden nacheinander freigeschaltet | nächste Kachel erst, wenn die vorige abgeschlossen ist |
| **Lern-Kachel** | „Variation 1 of 2“, segmentierter Fortschrittsbalken (Lernen + Wiederholen je Variation) | gleiche Logik: pro Variation erst Lernen, dann sofort Wiederholen |
| **Lernen** | Pfeil zeigt den eigenen Zug, Kommentar daneben, falsche Züge springen kommentarlos zurück | übernommen |
| **Variation abgeschlossen** | „Variation Complete!“, Buttons „Redo“ und „Continue to Review“, Abschluss-Kommentar mit Plan-Pfeilen | übernommen (Pfeile aus `[%cal]`) |
| **Wiederholen** | kein Kommentar, Hint-Button; falscher Zug: rotes Minus-Abzeichen an der Figur, dann zurück | übernommen |
| **Hint in 2 Stufen** | 1. Klick markiert die Figur („Hint“ → „Solution“), 2. Klick zeigt das Zielfeld + Kommentar | übernommen |
| **Brett-Navigation** | Anfang / zurück / vor / Ende – nur bis zur aktuellen Stellung | übernommen |
| **Study-Linien-Explorer** | Klick auf den Study-Titel: Brett + „nächster Zug“-Karte mit Variations-Chips | übernommen |
| **Course Explorer** | Dialog: freies Brett, „Kurszüge anzeigen“ (Pfeile), Zugliste, passende Studies | übernommen |
| **„…“-Menü** | Position analysieren, zurück zum Pfad, Video ansehen | übernommen (Analyse → Lichess-Analysebrett) |
| **XP & Level** | +XP nach jeder Variation, Level-Pille, XP-Diagramm der letzten 7 Tage | übernommen |
| **Streak** | Flammen-Zähler oben rechts, Popover mit Wochenleiste | übernommen |
| **Drill Shuffle** | Kurs wählen → Linien in zufälliger Reihenfolge drillen | übernommen |
| **Play Levi** | gegen einen Bot die Eröffnung spielen | Bot spielt Repertoire-Züge, danach Stockfish |
| **Bestenliste / Ligen** | wöchentliche Liga nach XP | dauerhafte Rangliste aller Konten nach Gesamt-XP im Profil |
| **Navigation** | Logo links, Streak + Avatar + Hamburger rechts; Menü: Profil, Home, Kurse, Bestenliste, Drill Shuffle, Bot, Einstellungen, Theme | gleiche Reihenfolge und Logik |
| **Kursübersicht** | Suche, Filter-Chips nach Kategorie, Kurskarten mit Icon + „Start Course“ | übernommen (Kategorien: Weiß, Schwarz, Importiert) |
| **Kursseite** | Icon, Titel, Course Explorer, Beschreibung, Fortschritt in %, Seitenleiste „Bot“ + „Drill Shuffle“ | übernommen, zusätzlich „Wiederholen“ (Spaced Repetition) |
| **Einstellungen** | Brett/Figuren anpassen, Fortschritt pro Kurs zurücksetzen | übernommen |

## Bewusst anders

- **Eigene Inhalte:** Repertoires und Erklärungen sind selbst geschrieben bzw. aus freien PGN-Quellen (Lichess-Studien).
- **Eigener Stil:** ähnliche Anordnung und dunkles Farbschema, aber eigenes Logo, eigene Farben (Türkis statt Pink), eigene Kachelgrafik.
- **Spaced Repetition** bleibt zusätzlich erhalten (Chessly-Wiederholung über Drill Shuffle; bei uns zusätzlich fällige Linien).
- **Kein Server:** alles lokal im Browser, Sicherung per JSON-Export.

## Status

- [x] Kapitel/Study-Struktur + Lernpfad mit Kacheln
- [x] Lern-Kachel: Lernen → Wiederholen pro Variation, Fortschrittssegmente, Redo
- [x] Hint in 2 Stufen, Fehler-Abzeichen, Brett-Navigation
- [x] XP, Level, Streak, XP-Diagramm
- [x] Navigation mit Hamburger-Menü, Kursübersicht mit Filtern
- [x] Study-Linien-Explorer, Course Explorer
- [x] Drill Shuffle
- [x] Bot (Repertoire + Stockfish)
- [x] Profil mit Rangliste, Einstellungen (Brettfarben, Theme, Reset pro Kurs)

Zusätzlich umgesetzt: Spaced-Repetition-Wiederholung (`#/review`) mit fälligen Varianten,
Kurs-Explorer als Dialog, helles Theme, Brettfarben Braun/Blau/Grün, Fortschritt pro Kurs zurücksetzen.
Kapitel- und Study-Gliederung von Caro-Kann (8 Kapitel, 21 Studies) und London-System (10 Kapitel, 25 Studies)
entspricht auf Wunsch 1:1 der Chessly-Kursübersicht (Titel auf Deutsch, gleiche Systeme); Varianten und Kommentare
sind selbst geschrieben.
