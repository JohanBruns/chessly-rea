"""Veröffentlicht einen frisch geladenen Kurs: Videos nach R2 hochladen, App bauen und deployen.

Das sind dieselben Befehle, die man sonst von Hand eintippt:
    npm run upload-videos   (bricht selbst ab, wenn der Bucket über die 8-GB-Grenze käme)
    npm run deploy          (baut die App und lädt sie auf Cloudflare Pages hoch)
Schlägt der Upload fehl, wird nicht deployt – sonst stünde ein Kurs ohne Videos online.
"""

import os
import re
import shutil
import subprocess

from browser import PROJECT_DIR
from downloader import Stopped

ROOT_DIR = PROJECT_DIR.parent

STEPS = [
    ("Lade Videos in den R2-Bucket", ["run", "upload-videos"]),
    ("Baue die App und veröffentliche sie auf Cloudflare Pages", ["run", "deploy"]),
]

ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
NOT_LOGGED_IN = re.compile(r"wrangler login|not (?:logged|authenticated)|authentication error|CLOUDFLARE_API_TOKEN", re.I)
TAIL_LINES = 25


def kill_tree(process):
    """Beendet den Prozess samt Kindprozessen (npm startet node, node startet wrangler)."""
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    else:
        process.kill()


def run_npm(args, cwd, log, should_stop=lambda: False):
    """Führt `npm <args>` aus und schreibt die Ausgabe zeilenweise ins Log.
    Gibt (Rückgabecode, letzte Ausgabezeilen) zurück. Rückgabecode 127 heißt: npm fehlt."""
    npm = shutil.which("npm")
    if not npm:
        return 127, ["npm nicht gefunden"]
    process = subprocess.Popen(
        [npm, *args],
        cwd=cwd,
        stdin=subprocess.DEVNULL,  # kein Nachfragen; nötig, weil die GUI ohne Konsole (pythonw) läuft
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "NO_COLOR": "1"},
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    tail = []
    try:
        for raw in process.stdout:
            line = ANSI.sub("", raw).rstrip()
            if not line:
                continue
            log("  " + line)
            tail = (tail + [line])[-TAIL_LINES:]
            if should_stop():
                kill_tree(process)
                raise Stopped()
        return process.wait(), tail
    finally:
        if process.poll() is None:
            kill_tree(process)


def failure_hint(tail):
    """Kurzer Rat zu typischen Fehlern, damit niemand im Log suchen muss."""
    text = "\n".join(tail)
    if NOT_LOGGED_IN.search(text):
        return ("Bei Cloudflare nicht angemeldet. Einmal im Projektordner `npx wrangler login` "
                "ausführen und danach den Kurs nochmal starten.")
    if "Abbruch" in text:
        return "Der Bucket ist zu voll. Nicht mehr benötigte Videos löschen oder die Videos kleiner kodieren."
    return None


def publish_course(log=print, should_stop=lambda: False, run=run_npm, root=ROOT_DIR):
    """Lädt Videos hoch und veröffentlicht die App. Gibt True zurück, wenn beides geklappt hat."""
    for title, args in STEPS:
        if should_stop():
            raise Stopped()
        command = "npm " + " ".join(args)
        log("")
        log(f"{title} ({command}) ...")
        code, tail = run(args, root, log, should_stop)
        if code == 127:
            log("npm wurde nicht gefunden. Bitte Node.js installieren, dann nochmal starten.")
            return False
        if code != 0:
            log(f"FEHLER: `{command}` ist mit Code {code} beendet worden.")
            hint = failure_hint(tail)
            if hint:
                log(hint)
            log("Es wurde nichts weiter veröffentlicht. Nach der Korrektur einfach nochmal starten – "
                "fertige Downloads werden übersprungen.")
            return False
    log("")
    log("Veröffentlicht! Auf dem iPhone die App einmal komplett schließen und neu öffnen.")
    return True
