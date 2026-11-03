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
`downloader/downloads/`. Ein Klick auf die Video-Kachel spielt das Video direkt in der App ab. Lokal liefert der
Dev-Server (`npm run dev` bzw. `start.cmd`) die Dateien aus, in der iPhone-App der private Cloudflare-Speicher
(siehe unten). Die Videos selbst sind nicht in Git.

## Aufs iPhone (Cloudflare, privat)

Die App läuft auf Cloudflare Pages, die Videos liegen in einem privaten R2-Bucket. Davor sitzt Cloudflare Access:
Nur deine E-Mail-Adresse kommt durch, für alle anderen ist weder die App noch ein Video erreichbar. Die
Video-Funktion (`functions/downloader/downloads/[[path]].js`) prüft das Access-Token zusätzlich selbst und
verweigert ohne gültige Anmeldung jedes Video. Alles läuft im kostenlosen Tarif. R2 enthält 10 GB Speicher
und berechnet keinen Download-Traffic. Cloudflare verlangt fürs Aktivieren von R2 aber eine hinterlegte
Zahlungsmethode.

### Einmalig einrichten

1. Kostenloses Konto auf <https://dash.cloudflare.com> anlegen und im Dashboard **R2** aktivieren.
2. Am PC anmelden (öffnet den Browser):

   ```bash
   npx wrangler login
   ```

3. Bucket und Pages-Projekt anlegen:

   ```bash
   npx wrangler r2 bucket create chessly-rea-videos
   ```

   ```bash
   npx wrangler pages project create chessly-rea --production-branch main
   ```

   Die Ausgabe nennt die Adresse, z. B. `https://chessly-rea.pages.dev`. Ist der Name schon vergeben, hängt
   Cloudflare etwas an. Dann diese Adresse in den nächsten Schritten verwenden.
4. **Zugang absichern** – im Dashboard unter **Zero Trust** (beim ersten Mal einen Teamnamen wählen und den
   kostenlosen Tarif nehmen):
   - **Access → Applications → Add an application → Self-hosted**
   - Domains: `chessly-rea.pages.dev` **und** `*.chessly-rea.pages.dev` (sonst wären die Vorschau-Adressen
     jeder Version offen)
   - Session Duration: z. B. *1 month*, damit die iPhone-App nicht ständig neu fragt
   - Policy: *Allow*, Include → *Emails* → deine E-Mail-Adresse
   - Nach dem Speichern den **Application Audience (AUD) Tag** kopieren. Die Team-Domain (`<team>.cloudflareaccess.com`)
     steht in den Zero-Trust-**Settings**.
5. Beide Werte in `wrangler.toml` eintragen:

   ```toml
   ACCESS_TEAM_DOMAIN = "<team>.cloudflareaccess.com"
   ACCESS_AUD = "<AUD-Tag>"
   ```

### Videos hochladen und App veröffentlichen

```bash
npm run upload-videos
```

```bash
npm run deploy
```

`upload-videos` lädt alle Videos hoch, auf die die PGN-Dateien in `openings/` verweisen. Schon hochgeladene
überspringt es (Liste in `downloader/downloads/.uploaded.json`). Nach neuen Kursen oder Videos einfach beide
Befehle erneut ausführen.

### Kosten im Blick

```bash
npm run usage
```

zeigt, wie viel der 10 GB belegt sind. `upload-videos` bricht ab, bevor der Bucket größer als 8 GB würde,
und lädt dann gar nichts hoch.

**E-Mail-Warnung:** Der Worker in `usageAlert/` zählt jeden Morgen (07:00 UTC) die Videos im Bucket und
schickt ab **6,8 GB** (85 % der 8-GB-Sperre) eine E-Mail. Solange der Bucket darüber bleibt, kommt sie täglich.
Versendet wird über [Resend](https://resend.com) (kostenlos, 100 Mails/Tag). Einmalig einrichten:

1. Im Cloudflare-Dashboard einmal **Workers & Pages** öffnen. Dabei legt Cloudflare die
   workers.dev-Subdomain an, ohne die keine Zeitpläne erlaubt sind.
2. Bei Resend mit derselben Adresse wie `ALERT_EMAIL` in `usageAlert/wrangler.toml` registrieren. Ohne
   eigene Domain darf Resend nur an diese Adresse schicken. Dann unter **API Keys** einen Schlüssel mit
   *Sending access* anlegen.
3. Den Schlüssel für den Worker hinterlegen (der Befehl fragt danach):

   ```bash
   npx wrangler secret put RESEND_API_KEY --config usageAlert/wrangler.toml
   ```

4. Worker veröffentlichen und Probe-Mail schicken:

   ```bash
   npm run deploy-alert
   ```

   ```bash
   npm run test-alert
   ```

   `test-alert` lässt den veröffentlichten Worker kurz jede Minute mit Probe-Mail laufen, wartet auf den
   ersten Lauf und schaltet ihn danach wieder auf den täglichen Zeitplan. Cloudflare braucht bis zu 15 Minuten,
   bis ein geänderter Zeitplan greift. Der Schlüssel bleibt dabei bei Cloudflare. Abrufe kosten nichts extra. Download-Traffic ist bei R2 kostenlos, und Videos
sind nur über die Pages-Funktion erreichbar. Die ist im Gratis-Tarif auf 100.000 Aufrufe pro Tag begrenzt, das
sind höchstens rund 3 Mio. Lesezugriffe im Monat (frei: 10 Mio.). Wichtig: Kein **Workers Paid**-Abo
abschließen und die öffentliche `r2.dev`-Adresse des Buckets ausgeschaltet lassen (Standard).

### Auf dem iPhone installieren

1. In **Safari** die Pages-Adresse öffnen und mit dem Code anmelden, den Cloudflare an deine E-Mail schickt.
2. **Teilen → Zum Home-Bildschirm**. Die App startet danach im Vollbild und meldet sich beim ersten Start
   noch einmal an. Safari und Home-Bildschirm-App haben getrennte Speicher.
3. Die App selbst funktioniert danach auch offline, Videos brauchen eine Internetverbindung.

Der Lernstand liegt pro Gerät. Mit **Einstellungen → Sicherung herunterladen** am PC und dem Import auf dem
iPhone überträgst du ihn (und umgekehrt).

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
| `src/bot.js`, `src/engine.js` | Repertoire-Züge des Bots, Stockfish als Web Worker |
| `src/ui/` | Topbar & Menü, Icons & Logo, Kurs-Icons, Kachelpfad (SVG), XP-Diagramm, Toasts |
| `src/views/` | Home, Kurse, Kursseite, Sitzung, Explorer, Drill Shuffle, Wiederholen, Bot, Profil, Einstellungen, Import |
| `functions/`, `wrangler.toml` | Cloudflare Pages: Videos aus R2 mit Access-Prüfung und Range-Anfragen |
| `usageAlert/` | Cloudflare Worker: täglicher Speicher-Check mit E-Mail-Warnung über Resend |
| `scripts/uploadVideos.js`, `scripts/usage.js`, `scripts/r2Limits.js` | Video-Upload mit 8-GB-Sperre, Verbrauchsanzeige, gemeinsame Grenzen |
| `public/sw.js`, `public/manifest.webmanifest` | Installierbare App (PWA), Offline-Cache für App und Stockfish |
| `downloader/` | Python-Tool (tkinter, Playwright, yt-dlp) zum Herunterladen der Chessly-Kursvideos |

Brett: [chessground](https://github.com/lichess-org/chessground) (Lichess, GPL-3.0), Regeln:
[chess.js](https://github.com/jhlywa/chess.js), Engine: [stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL-3.0).
