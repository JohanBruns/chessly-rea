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
**XP, Level, Streak** und eine dauerhafte **Rangliste** aller Konten im Profil.

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
| Chessly-Katalog (fehlende Kurse selbst hinzufügen) | `#/chessly` |
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
Browser-Speicher und folgen dem Konto auf andere Geräte.

## Kursvideos herunterladen (`downloader/`)

Im Ordner `downloader/` liegt ein kleines Python-Tool, das einen kompletten Chessly-Kurs auf den PC holt
(mit deinem eigenen Chessly-Login): alle Lektionsvideos als MP4, alle Kapitel/Studies mit Linien und daraus
eine fertige PGN in `openings/`. Einmal `downloader\setup.bat`, danach `downloader\start.bat`, Kurs-Link
einfügen (auch mehrere untereinander) und **Download starten**. Mit dem Standard-Häkchen lädt der Downloader die Videos danach selbst nach R2
und veröffentlicht die App (`npm run upload-videos`, `npm run deploy`). Nur das Committen bleibt für dich.
Skill-Kurse ohne Linien (z. B. Beginner Tactics) erscheinen als **Videokurs**: eine Study pro Lektion, Fortschritt
aus den angesehenen Videos, ohne Drill, Bot und Kurs-Explorer.
Details in [downloader/README.md](downloader/README.md).

Caro-Kann und London-System sind schon verknüpft: Jede Study hat einen `[Video]`-Eintrag auf ihre MP4 in
`downloader/downloads/`. Ein Klick auf die Video-Kachel spielt das Video direkt in der App ab. Lokal liefert der
Dev-Server (`npm run dev` bzw. `start.cmd`) die Dateien aus, in der iPhone-App der private Cloudflare-Speicher
(siehe unten). Die Videos selbst sind nicht in Git.

## Fehlende Chessly-Kurse hinzufügen

Unter **Menü → Chessly-Katalog** (`#/chessly`) stehen alle Kurse aus deinem Chessly-Konto, die noch nicht in
`openings/` liegen – mit Suche und Filtern (Eröffnung, Skill-Kurs, Weiß/Schwarz, in Arbeit). Kurse mit dem Tag
„Bald verfügbar“ sind bei Chessly noch nicht erschienen; „Videos geladen“ heißt, dass schon MP4-Dateien in
`downloader/downloads/` liegen.

Die Liste kommt nicht live aus dem Browser, sondern aus `downloader/catalog.json`. Sie wird mit deinem
gespeicherten Chessly-Login erzeugt:

```bash
npm run catalog
```

Danach die Seite neu laden (im Dev-Server reicht das, für die veröffentlichte App `npm run deploy`). Ob ein Kurs
schon vorhanden ist, erkennt die App am `[ChesslyCourse "<Kurs-ID>"]`-Header der PGN-Datei, sonst am Kursnamen.

**Hinzufügen:** Jedes Konto kann mit dem Knopf **Hinzufügen** einen Kurs komplett in die App holen, also Videos,
Linien und PGN. Der Knopf legt nur einen Auftrag in die Datenbank (`course_requests`), denn Chessly-Login und
Download-Werkzeug gibt es nur auf dem PC. Dort holt `downloader\warteschlange.bat` die Aufträge ab, ein Kurs nach dem
anderen, und veröffentlicht danach automatisch (`npm run upload-videos`, `npm run deploy`). Der Stand ist für alle
Konten gleich: „In Warteschlange“, „Wird geladen …“, „Fertig: App neu laden“ oder die Fehlermeldung mit „Erneut versuchen“.
Ein Konto kann höchstens 3 Kurse gleichzeitig in Arbeit haben.

Einmalig einrichten: `npm run db:migrate`, `npm run deploy`, und im Haupt-Checkout `npx wrangler login`. Der Worker
startet dann unsichtbar mit der Windows-Anmeldung über die Verknüpfung „Chessly Warteschlange“ im Autostart-Ordner
(`Win+R`, `shell:startup`): Ziel `downloader\.venv\Scripts\pythonw.exe`, Argument `queue_worker.py`, Ausführen in
`downloader`. Seine Ausgaben stehen in `downloader\queue_worker.log`. Beenden geht im Task-Manager (`pythonw.exe`),
abschalten durch Löschen der Verknüpfung. Mit `downloader\warteschlange.bat` läuft er stattdessen in einem Fenster;
läuft er schon im Hintergrund, meldet das Fenster das nur, denn es darf immer nur einen Worker geben.

Gut zu wissen:

- Aufträge warten, solange der PC aus ist oder schläft oder der Worker nicht läuft. Einen Hinweis darauf gibt es nur als
  festen Text in der App. Während ein Kurs läuft, verhindert der Worker den Ruhezustand; der Bildschirm darf ausgehen.
- Der Worker veröffentlicht nur von `main` und nur, wenn außerhalb von `openings/`, `downloader/lines/` und
  `downloader/catalog.json` nichts uncommittet ist. So stellt ein Klick in der App keine halbfertige Arbeit live.
  Solange das nicht passt, wartet der Kurs und das Fenster nennt den Grund.
- Nach jedem veröffentlichten Kurs committet der Worker `openings/` und `downloader/lines/` und pusht `main`, also auch
  alle anderen lokalen Commits auf `main`. Scheitert das (kein Netz, GitHub hat neuere Commits), bleibt der Kurs online,
  der Fehler steht im Log und der nächste Kurs versucht es erneut. Force-Push und Pull macht der Worker nie.
- Der Downloader und der Worker teilen sich den Login-Ordner und können nicht gleichzeitig laufen. Sonst schlägt der
  Kurs fehl und lässt sich mit „Erneut versuchen“ neu anstoßen.
- Wer einen Kurs hinzufügt, bekommt beim Öffnen der App einen Hinweis, sobald er da ist; mit früher erteilter Erlaubnis
  auch als Browser-Benachrichtigung. Die Merkliste dafür bleibt auf dem Gerät.

## Aufs iPhone (Cloudflare, privat)

Die App läuft auf Cloudflare Pages, die Videos liegen in einem privaten R2-Bucket, Konten und Lernstand in einer
D1-Datenbank. Ein neues Konto lässt sich nur mit dem Einladungscode anlegen. Öffentlich ist nur die Anmeldeseite:
Die App samt Kursinhalten (`dist/app/`) und die Videos liefert der Server nur mit gültiger Anmeldung aus
(`functions/app/[[path]].js`, `functions/downloader/downloads/[[path]].js`). Nach zehn Fehlversuchen beim Anmelden
oder beim Code ist der Absender für 15 Minuten gesperrt. Alles läuft im kostenlosen Tarif. R2 enthält 10 GB Speicher
(darüber kostet es 0,015 $ pro GB und Monat, bei 25 GB also etwa 0,23 $ und bei 100 GB etwa 1,35 $) und berechnet keinen Download-Traffic. Cloudflare verlangt fürs Aktivieren von R2 aber eine hinterlegte
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
4. Datenbank für die Konten anlegen und die ausgegebene `database_id` in `wrangler.toml` eintragen:

   ```bash
   npx wrangler d1 create chessly-rea
   ```

5. Tabellen anlegen:

   ```bash
   npm run db:migrate
   ```

6. Einladungscode festlegen. Der Befehl fragt den Code ab, er landet also weder im Repository noch im Verlauf. Ohne
   hinterlegten Code lässt sich kein neues Konto anlegen:

   ```bash
   npx wrangler pages secret put INVITE_CODE --project-name chessly-rea
   ```

7. Pages-Projekt mit der Datenbank verbinden: `npm run deploy` liest die Bindungen aus `wrangler.toml`.
8. Falls vor der Seite noch eine Cloudflare-Access-Anwendung liegt: im Dashboard unter **Zero Trust → Access →
   Applications** löschen, sonst kommen neue Nutzer nicht bis zur Anmeldeseite.

### Einladungscode ändern

Den Befehl aus Schritt 6 erneut ausführen, danach `npm run deploy`: Ein neues Secret gilt erst ab der nächsten
Veröffentlichung. Bestehende Konten bleiben gültig, der alte Code legt aber keine neuen mehr an.

Vorhandene Konten anzeigen:

```bash
npx wrangler d1 execute chessly-rea --remote --command "SELECT username, datetime(created_at / 1000, 'unixepoch') AS erstellt FROM users"
```

### Passwort-Links einrichten

„Passwort vergessen“ verschickt über [Resend](https://resend.com) an `ADMIN_EMAIL` in `wrangler.toml`. Ohne eigene
Domain muss das die Adresse des Resend-Kontos sein. Einmalig Tabelle anlegen und Schlüssel hinterlegen (der Befehl
fragt danach; neuen Schlüssel unter **API Keys** in Resend anlegen, der vom Speicher-Worker lässt sich nicht
auslesen), danach veröffentlichen:

```bash
npm run db:migrate
```

```bash
npx wrangler pages secret put RESEND_API_KEY --project-name chessly-rea
```

```bash
npm run deploy
```

Ohne Schlüssel sieht die Anmeldeseite genauso aus, es kommt aber keine Mail an. Der Grund steht dann im Log der
Pages-Funktion.

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

zeigt, wie viel der 10 GB belegt sind und, falls du darüber liegst, was der Speicher im Monat kostet. `upload-videos`
hat keine Obergrenze. Kosten über den freien 10 GB: 0,015 $ pro GB und Monat (R2 rundet auf volle GB auf), also
12 GB ≈ 0,03 $, 25 GB ≈ 0,23 $, 100 GB ≈ 1,35 $.

**E-Mail-Warnung:** Der Worker in `usageAlert/` zählt jeden Morgen (07:00 UTC) die Videos im Bucket und
schickt ab **100 GB** eine E-Mail. Solange der Bucket darüber bleibt, kommt sie täglich; Uploads stoppt sie nicht.
Die Schwelle steht in `scripts/r2Limits.js` (`ALERT_BYTES`), danach den Worker neu deployen (`npm run deploy-alert`).
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

1. In **Safari** die Pages-Adresse öffnen.
2. **Teilen → Zum Home-Bildschirm**. Die App startet danach im Vollbild und fragt beim ersten Start nach der
   Anmeldung. Safari und Home-Bildschirm-App haben getrennte Speicher.
3. Konto erstellen oder anmelden. Die App selbst funktioniert danach auch offline, Videos brauchen eine
   Internetverbindung, außer sie sind offline gespeichert.

## Konten

Jedes Konto hat eigenen Lernstand, XP, Streak, eigene importierte Kurse und Einstellungen. Das Konto folgt dir auf
jedes Gerät: anmelden, und der Stand ist da. Ein zweites Gerät mit einem anderen Konto hat einen eigenen Fortschritt.

- **Offline:** Die App arbeitet immer auf dem Gerätespeicher und gleicht ihn im Hintergrund ab, sobald Netz da ist.
  Haben zwei Geräte offline am selben Konto gelernt, werden beide Stände zusammengeführt (pro Variante gewinnt die
  neuere Wiederholung). Nur für die Anmeldung selbst braucht die App Internet.
- **Alter Lernstand:** Gibt es auf dem Gerät Fortschritt von vor den Konten, fragt die App bei der ersten Anmeldung,
  ob er ins Konto übernommen werden soll.
- **Offline-Videos** liegen pro Gerät, alle Konten auf dem Gerät teilen sie sich.
- **Passwort vergessen:** Konten haben keine E-Mail-Adresse. Deshalb geht der Link von der Anmeldeseite per Mail an
  den Admin (`ADMIN_EMAIL` in `wrangler.toml`), der ihn selbst nutzt oder an die Person weiterleitet. Der Link gilt
  24 Stunden und nur einmal; danach sind alle anderen Geräte des Kontos abgemeldet. Pro Konto geht höchstens eine
  Mail pro Stunde raus. Einrichtung siehe „Passwort-Links einrichten“.
- **Lokal mit `npm run dev`:** Ohne Server-Funktionen gibt es keine Anmeldung, die App läuft ohne Konto wie bisher.
  Zum Testen mit Konten: `npm run build`, `npm run db:migrate:local`, dann `npx wrangler pages dev`.

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

Für einen ganz neuen Kurs muss keine PGN-Vorlage existieren: Der Downloader legt sie mit
`scripts/buildFromChessly.js --new downloader/lines/<Kurs>.json` automatisch in `openings/` an.

`npm run neuaufbau -- openings/caroKann.pgn` baut die Studies einer PGN-Datei aus den Chessly-Linien neu auf:
Kopfzeilen (deutsche Titel, Kapitelbeschreibungen, Videos) bleiben, Züge, Kommentare und Pfeile kommen von Chessly –
in derselben Variantenreihenfolge. Übersetzungen liegen in `downloader/lines/<Kurs>.de.json`
(englischer Kommentar → deutscher Text, `intro:<Study-ID>` → Einführung); fehlt eine, bleibt der Kommentar englisch.
Caro-Kann und London-System sind so aufgebaut; der Test in `tests/openings.test.js` prüft, dass jede Chessly-Variante
vollständig enthalten ist.

## Lernstand sichern

Lernstand, XP und Streak liegen im `localStorage` des Browsers und mit Konto zusätzlich in D1. Unter **Einstellungen →
Sicherung herunterladen** exportierst du alles als JSON und kannst es in einem anderen Browser wiederherstellen. Dort
lässt sich auch der Fortschritt einzelner Kurse zurücksetzen.

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
| `src/progress.js` | Kachel-Freischaltung, Kursfortschritt, Level, Streak |
| `src/lineSession.js` | Ablauf einer Variante (Lernen/Wiederholen, Hinweis-Stufen, Navigation), ohne DOM |
| `src/tileSession.js` | Ablauf einer Kachel (Lernen + Wiederholen je Variante, gemischter Drill), ohne DOM |
| `src/scheduler.js` | Spaced Repetition |
| `src/courseCompare.js`, `scripts/compareCourse.js` | Abgleich eines Kurses mit den Chessly-Linien (`npm run abgleich`) |
| `src/chesslyCatalog.js`, `src/views/chesslyView.js`, `downloader/catalog.py`, `scripts/chesslyCatalog.js` | Chessly-Katalog der fehlenden Kurse (`npm run catalog`) und die Seite `#/chessly` |
| `functions/api/courseRequests.js`, `src/courseRequests.js`, `downloader/queue_worker.py` | Warteschlange hinter dem Knopf „Hinzufügen“: App → D1 → PC |
| `src/watchlist.js` | Vorgemerkte Kurse, Benachrichtigungen und Prüfung beim Öffnen der App |
| `src/bot.js`, `src/engine.js` | Repertoire-Züge des Bots, Stockfish als Web Worker |
| `src/ui/` | Topbar & Menü, Icons & Logo, Kurs-Icons, Kachelpfad (SVG), XP-Diagramm, Toasts |
| `src/views/` | Home, Kurse, Kursseite, Sitzung, Explorer, Drill Shuffle, Wiederholen, Bot, Profil, Einstellungen, Import |
| `src/account.js`, `src/sync.js` | Anmeldung auf dem Gerät, Abgleich des Lernstands mit dem Server, Zusammenführen |
| `functions/api/`, `functions/_lib/`, `migrations/` | Registrieren mit Einladungscode, Anmelden, Passwort-Links, Abgleich, Rangliste, Passwort-Hash, Sitzungen und Fehlversuche auf D1 |
| `functions/app/`, `scripts/checkPrivateBundle.js` | App samt Kursinhalten nur mit Anmeldung; der Build bricht ab, wenn Kursinhalte im öffentlichen Teil landen |
| `functions/downloader/`, `wrangler.toml` | Cloudflare Pages: Videos aus R2 mit Anmeldeprüfung und Range-Anfragen |
| `usageAlert/` | Cloudflare Worker: täglicher Speicher-Check mit E-Mail-Warnung über Resend |
| `scripts/uploadVideos.js`, `scripts/usage.js`, `scripts/r2Limits.js` | Video-Upload, Verbrauchsanzeige und Kosten, Warnschwelle |
| `public/sw.js`, `public/manifest.webmanifest` | Installierbare App (PWA), Offline-Cache für App und Stockfish |
| `downloader/` | Python-Tool (tkinter, Playwright, yt-dlp) zum Herunterladen der Chessly-Kursvideos |

Brett: [chessground](https://github.com/lichess-org/chessground) (Lichess, GPL-3.0), Regeln:
[chess.js](https://github.com/jhlywa/chess.js), Engine: [stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL-3.0).
