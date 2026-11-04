# Chessly Downloader

Kleines Windows-Tool mit GUI, das einen kompletten Chessly-Kurs auf den PC holt:
alle Lektionsvideos als MP4, alle Kapitel/Studies mit ihren Linien und daraus eine
fertige PGN für `openings/` – für den persönlichen Offline-Gebrauch mit deinem eigenen
Chessly-Abo.

Mit dem Häkchen **„Kompletter Kurs“** (standardmäßig an) ist der Kurs nach einem
einzigen Link-Eintrag bereit zum Committen und Pushen.

## Einrichtung (einmalig)

1. [Python](https://www.python.org/downloads/) installieren (Haken bei **"Add python.exe to PATH"**).
2. `setup.bat` doppelklicken. Das legt eine virtuelle Umgebung an und installiert
   yt-dlp, imageio-ffmpeg (bringt ffmpeg mit) und Playwright inkl. Chromium.

## Benutzung

1. `start.bat` doppelklicken.
2. Einmalig **Login** klicken → im Browserfenster bei Chessly einloggen → Fenster schließen.
   Der Login wird im Ordner `browser_profile` gespeichert.
3. Kurs-Link einfügen, z.B. `https://chessly.com/courses/0897f49e-d26d-42f5-82e9-ce37307b760a`
4. **Download starten**.

Ergebnis bei „Kompletter Kurs“:

| Wo | Was |
|---|---|
| `downloads/<Kursname>/` | alle Videos, benannt nach `01-02 Kapitelname - Lektionsname.mp4` |
| `lines/<Kursname>.json` | alle Kapitel, Studies, Varianten, Kommentare und Video-Pfade |
| `openings/<kursname>.pgn` | fertiger Kurs für die App – mit Kapiteln, Studies, `[Video]` und Linien |

Mit dem zweiten Häkchen **„Danach automatisch hochladen und veröffentlichen“** (standardmäßig an)
macht der Downloader danach selbst weiter, was man sonst von Hand eintippt:

1. `npm run upload-videos` – Videos in den R2-Bucket (stoppt vor der 8-GB-Grenze).
2. `npm run deploy` – App bauen und auf Cloudflare Pages hochladen.

Schlägt der Upload fehl, wird nicht deployt. Bei fehlerhaften Videos oder Skill-Kursen
(ohne PGN) wird das Veröffentlichen übersprungen. Einmalig vorher im Projektordner
`npx wrangler login` ausführen, sonst meldet das Log „nicht angemeldet“.
Zum Sichern im Repository zeigt das Log am Ende noch `git add` und `git commit`
(das macht der Downloader nicht selbst).

Ohne das zweite Häkchen bleibt es bei den manuellen Schritten:

```bash
npm run upload-videos
npm run deploy
git add openings downloader/lines
git commit -m "Kurs: <Kursname>"
```

Bereits geladene Videos werden übersprungen. Nach einem Abbruch (oder **Stopp**)
einfach wieder starten – es geht dort weiter, wo es aufgehört hat. Eine vorhandene
PGN wird nicht überschrieben; für ein Update der Linien danach
`npm run neuaufbau -- openings/<datei>.pgn` verwenden.

**Hinweis:** Linien und PGN gibt es nur für Eröffnungskurse (`/courses/...`).
Skill-Kurse haben bei Chessly keine Studien-Linien; dort werden nur die Videos geladen.

## Wie es funktioniert

| Datei | Aufgabe |
|---|---|
| `gui.py` | Fenster (tkinter) und der Gesamtablauf |
| `browser.py` | Chromium mit gespeichertem Login-Profil |
| `chessly.py` | Findet Kapitel/Lektionen eines Kurses und die Vimeo-ID jeder Lektion |
| `downloader.py` | Lädt ein Vimeo-Video mit yt-dlp und fügt Bild + Ton zu MP4 zusammen |
| `exporter.py` | Der komplette Ablauf: Videos + `lines/<Kurs>.json` + PGN in `openings/` |
| `publisher.py` | Danach `npm run upload-videos` und `npm run deploy` (Tests: `tests/python/`) |
| `lines.py` | Speichert alle Varianten (Züge + Kommentare) eines Kurses nach `lines/<Kurs>.json` – für `npm run abgleich` |
| `catalog.py` | Liest alle Kurse deines Kontos nach `catalog.json` – für die Seite „Chessly-Katalog“ (`npm run catalog`) |

Chessly bettet die Videos über Vimeo ein. Vimeo spielt sie nur ab, wenn die Anfrage
von chessly.com kommt – darum schickt der Downloader `Referer: https://chessly.com/` mit.

**Wichtig:** `browser_profile/` enthält deine Login-Cookies und wird per `.gitignore`
nie hochgeladen.
