# Chessly Downloader

Kleines Windows-Tool mit GUI, das alle Lektionsvideos eines Chessly-Kurses als MP4 herunterlädt –
für den persönlichen Offline-Gebrauch mit deinem eigenen Chessly-Abo.

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

Die Videos landen in `downloads/<Kursname>/`, benannt nach dem Muster
`01-02 Kapitelname - Lektionsname.mp4` (Kapitel 1, Lektion 2).

Bereits geladene Videos werden übersprungen. Nach einem Abbruch (oder **Stopp**)
einfach wieder starten – es geht dort weiter, wo es aufgehört hat.

## Wie es funktioniert

| Datei | Aufgabe |
|---|---|
| `gui.py` | Fenster (tkinter) und der Gesamtablauf |
| `browser.py` | Chromium mit gespeichertem Login-Profil |
| `chessly.py` | Findet Kapitel/Lektionen eines Kurses und die Vimeo-ID jeder Lektion |
| `downloader.py` | Lädt ein Vimeo-Video mit yt-dlp und fügt Bild + Ton zu MP4 zusammen |

Chessly bettet die Videos über Vimeo ein. Vimeo spielt sie nur ab, wenn die Anfrage
von chessly.com kommt – darum schickt der Downloader `Referer: https://chessly.com/` mit.

**Wichtig:** `browser_profile/` enthält deine Login-Cookies und wird per `.gitignore`
nie hochgeladen.
