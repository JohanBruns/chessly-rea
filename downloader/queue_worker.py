"""Arbeitet die Kurse ab, die Konten im Chessly-Katalog der App hinzugefügt haben.

Die App liegt bei Cloudflare, der Chessly-Login und das Download-Werkzeug nur auf diesem PC.
Deshalb legt der Knopf „Hinzufügen“ nur einen Auftrag in die Datenbank (Tabelle course_requests),
und dieses Programm holt ihn ab: Videos, Linien und PGN laden, Videos nach R2, App veröffentlichen,
Kursdateien committen und pushen.
Bei jedem Kurs öffnet sich einmal ein Hinweisfenster mit dem Konto, das ihn hinzugefügt hat, und am Ende steht
eine Zeile in queue_history.log: wann, wer, welcher Kurs, Ergebnis.
Für die Datenbank nutzt es den Login von `npx wrangler login`.

Aufruf: unsichtbar über den Autostart (pythonw) oder mit warteschlange.bat im Fenster. Es läuft immer nur
ein Kurs auf einmal und nur ein Worker. Alle Ausgaben stehen auch in queue_worker.log.
"""

import contextlib
import json
import logging
import logging.handlers
import os
import shutil
import subprocess
import sys
import time

from browser import PROJECT_DIR
from chessly import NotLoggedIn, parse_course_links
from exporter import DEFAULT_WORKERS, export_courses

ROOT_DIR = PROJECT_DIR.parent
TARGET_DIR = PROJECT_DIR / "downloads"
WRANGLER = ROOT_DIR / "node_modules" / "wrangler" / "bin" / "wrangler.js"
DATABASE = "chessly-rea"
POLL_SECONDS = 60
GIT_TIMEOUT_SECONDS = 300
LOG_FILE = PROJECT_DIR / "queue_worker.log"
LOCK_FILE = PROJECT_DIR / "queue_worker.lock"
NOTIFIED_FILE = PROJECT_DIR / "queue_worker_notified.json"
NOTIFIED_KEEP = 200
HISTORY_FILE = PROJECT_DIR / "queue_history.log"
POPUP_TITLE = "Chessly Warteschlange"

# Diese Pfade entstehen beim Hinzufügen selbst und halten das Veröffentlichen nicht auf.
COURSE_PATHS = ("openings/", "downloader/lines/", "downloader/catalog.json")
# Das Veröffentlichen baut die App aus allen Dateien in openings/. Genau das wird danach auch gesichert.
SAVED_PATHS = ("openings", "downloader/lines")
RELEASE_BRANCH = "main"

# Die Meldungen sehen alle Konten in der App.
NOT_LOGGED_IN = "Die Chessly-Anmeldung auf dem PC ist abgelaufen."
READ_FAILED = "Der Kurs ließ sich bei Chessly nicht lesen."
PUBLISH_FAILED = "Hochladen oder Veröffentlichen ist fehlgeschlagen."
UNEXPECTED = "Beim Hinzufügen ist ein Fehler aufgetreten."
BAD_LINK = "Der Link zu diesem Kurs ist ungültig."


class DatabaseError(Exception):
    pass


class Database:
    """Führt SQL über wrangler aus. Wrangler läuft direkt mit node und nicht über npx.cmd,
    damit keine Windows-Eingabeaufforderung die Zeichen im SQL-Text umdeutet."""

    def __init__(self, location="--remote"):
        self.location = location

    def run(self, sql):
        node = shutil.which("node")
        if not node:
            raise DatabaseError("Node.js wurde nicht gefunden.")
        result = subprocess.run(
            [node, str(WRANGLER), "d1", "execute", DATABASE, self.location, "--yes", "--json", "--command", sql],
            cwd=ROOT_DIR,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()[-400:]
            raise DatabaseError(f"Datenbank nicht erreichbar (npx wrangler login nötig?): {detail}")
        try:
            return json.loads(result.stdout)[0].get("results") or []
        except (ValueError, IndexError, AttributeError) as error:
            raise DatabaseError(f"Unerwartete Antwort von wrangler: {error}") from error


def sql_text(value):
    return "NULL" if value is None else "'" + str(value).replace("'", "''") + "'"


def next_course(db):
    """Der älteste wartende Kurs; requested_by ist der Kontoname (None, wenn das Konto gelöscht ist)."""
    rows = db.run("SELECT r.chessly_id, r.name, r.url, r.requested_at, u.username AS requested_by "
                  "FROM course_requests r LEFT JOIN users u ON u.id = r.requested_by "
                  "WHERE r.status = 'queued' ORDER BY r.requested_at LIMIT 1")
    return rows[0] if rows else None


def set_status(db, course_id, status, message=None):
    now = int(time.time() * 1000)
    db.run(f"UPDATE course_requests SET status = {sql_text(status)}, message = {sql_text(message)}, "
           f"updated_at = {now} WHERE chessly_id = {sql_text(course_id)}")


def requeue_running(db):
    """Nur dieses Programm setzt „running“. Nach einem Absturz oder Neustart kommt so ein Kurs
    wieder dran; fertige Downloads und Uploads werden dabei übersprungen."""
    db.run("UPDATE course_requests SET status = 'queued' WHERE status = 'running'")


def git_output(args, root):
    result = subprocess.run(
        ["git", *args], cwd=root, capture_output=True, text=True, encoding="utf-8", errors="replace",
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},  # im Hintergrund kann niemand ein Passwort eintippen
        stdin=subprocess.DEVNULL,
        timeout=GIT_TIMEOUT_SECONDS,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "").strip())
    return result.stdout


def publish_blocker(root=ROOT_DIR, git=git_output):
    """Das Veröffentlichen lädt den Ordner so hoch, wie er gerade ist, und ein Klick in der App darf keine
    halbfertige Arbeit live stellen. Gibt den Grund zurück, warum gerade nichts laufen darf, sonst None."""
    try:
        branch = git(["rev-parse", "--abbrev-ref", "HEAD"], root).strip()
        if branch != RELEASE_BRANCH:
            return f"Der Projektordner steht auf „{branch}“, veröffentlicht wird nur von „{RELEASE_BRANCH}“."
        status = git(["status", "--porcelain", "-z", "--no-renames", "--untracked-files=all"], root)
    except (OSError, RuntimeError) as error:
        return f"Git-Stand nicht lesbar: {error}"
    files = [entry[3:] for entry in status.split("\0") if entry]
    others = [path for path in files if not path.startswith(COURSE_PATHS)]
    if others:
        shown = ", ".join(others[:5]) + (" …" if len(others) > 5 else "")
        return f"{len(others)} Datei(en) mit nicht committeten Änderungen: {shown}"
    return None


def save_course(name, log=print, root=ROOT_DIR, git=git_output):
    """Committet die Kursdateien und pusht main. Der Kurs ist da schon online, deshalb stoppt ein Fehler hier
    nichts: Er landet im Log, und der nächste Kurs holt Commit und Push mit nach."""
    try:
        branch = git(["rev-parse", "--abbrev-ref", "HEAD"], root).strip()
        if branch != RELEASE_BRANCH:
            log(f"Nicht gesichert: Der Projektordner steht inzwischen auf „{branch}“.")
            return
        git(["add", "-A", "--", *SAVED_PATHS], root)
        if git(["status", "--porcelain", "--", *SAVED_PATHS], root).strip():
            git(["commit", "-m", f"feat: Kurs {name}", "--", *SAVED_PATHS], root)
            log(f"Committet: {name}")
        git(["push", "origin", RELEASE_BRANCH], root)
        log("Nach GitHub gepusht.")
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        log(f"Nicht gesichert: {error}. Der nächste Kurs versucht es erneut.")


def show_popup(title, text):
    """Hinweisfenster über allen anderen Fenstern. Es läuft in einem eigenen Thread, damit der Kurs
    schon lädt, während das Fenster offen ist."""
    if os.name != "nt":
        return
    import ctypes
    import threading
    info, set_foreground, topmost = 0x40, 0x10000, 0x40000
    threading.Thread(
        target=ctypes.windll.user32.MessageBoxW,
        args=(None, text, title, info | set_foreground | topmost),
        daemon=True,
    ).start()


def requester(course):
    return course.get("requested_by") or "Ein gelöschtes Konto"


def notify_request(course, log=print, path=NOTIFIED_FILE, show=show_popup):
    """Zeigt einmal pro Auftrag ein Fenster mit dem Konto, das den Kurs hinzugefügt hat (auch beim eigenen).
    Gezeigte Aufträge stehen in NOTIFIED_FILE, damit ein Kurs, der nach einem Neustart wieder drankommt, nicht
    nochmal meldet. Ein neuer Versuch nach einem Fehler ist ein neuer Auftrag (neues requested_at) und meldet wieder."""
    key = f"{course['chessly_id']}:{course.get('requested_at')}"
    try:
        seen = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(seen, list):
            seen = []
    except (OSError, ValueError):
        seen = []
    if key in seen:
        return False
    try:
        path.write_text(json.dumps((seen + [key])[-NOTIFIED_KEEP:]), encoding="utf-8")
    except OSError as error:
        log(f"Gezeigte Hinweise nicht gespeichert: {error}")

    show(POPUP_TITLE, f"{requester(course)} hat den Kurs „{course['name']}“ hinzugefügt.\n\n"
                      "Die Warteschlange lädt ihn jetzt herunter und veröffentlicht ihn danach.")
    return True


def local_time(milliseconds):
    return time.strftime("%Y-%m-%d %H:%M", time.localtime(milliseconds / 1000))


def record_history(course, result, log=print, path=HISTORY_FILE, now=None):
    """Hängt eine Zeile an den Verlauf: wann hinzugefügt | Konto | Kurs | Ergebnis mit Uhrzeit.
    Anders als queue_worker.log wird diese Datei nie gekürzt."""
    finished = local_time(now if now is not None else time.time() * 1000)
    added = local_time(course["requested_at"]) if course.get("requested_at") else "?"
    line = f"{added} | {requester(course)} | {course['name']} | {result} {finished}\n"
    try:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(line)
    except OSError as error:
        log(f"Verlauf nicht gespeichert: {error}")


def failure_message(result):
    """Meldung für die App oder None, wenn der Kurs online ist."""
    if result["published"]:
        return None
    if result["failed"]:
        return READ_FAILED
    errors = sum(plan["errors"] for plan in result["courses"])
    if errors:
        return f"{errors} Video(s) konnten nicht geladen werden."
    return PUBLISH_FAILED


def default_export(links, log):
    return export_courses(links, TARGET_DIR, log, lambda: False, True, True, DEFAULT_WORKERS)


def process_course(db, course, log=print, export=default_export, save=save_course, notify=notify_request,
                   history=record_history):
    """Lädt, veröffentlicht und sichert einen Kurs und trägt das Ergebnis ein."""
    course_id, name = course["chessly_id"], course["name"]
    links, _, _ = parse_course_links(course["url"])
    if not links:
        set_status(db, course_id, "failed", BAD_LINK)
        history(course, f"fehlgeschlagen ({BAD_LINK})", log)
        return
    set_status(db, course_id, "running")
    log(f"Hinzufügen: {name} (von {requester(course)})")
    try:
        notify(course, log)
    except Exception as error:  # Ein Hinweisfenster darf den Kurs nicht aufhalten.
        log(f"Hinweisfenster fehlgeschlagen: {error}")

    try:
        message = failure_message(export(links, log))
    except NotLoggedIn:
        log('Nicht eingeloggt! Bitte im Downloader (start.bat) auf "Login" klicken.')
        message = NOT_LOGGED_IN
    except Exception as error:  # Ein kaputter Kurs darf die Warteschlange nicht anhalten.
        log(f"FEHLER bei {name}: {error}")
        message = UNEXPECTED

    if message:
        log(f"Fehlgeschlagen: {name} ({message})")
        set_status(db, course_id, "failed", message)
        history(course, f"fehlgeschlagen ({message})", log)
    else:
        log(f"Fertig: {name}")
        save(name, log)
        set_status(db, course_id, "done")
        history(course, "fertig", log)


def make_log(path=LOG_FILE):
    """Schreibt in die Logdatei und, falls es ein Fenster gibt, auch dorthin (ohne Fenster tut print nichts)."""
    logger = logging.getLogger(f"queue_worker.{path}")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    handler = logging.handlers.RotatingFileHandler(path, maxBytes=2_000_000, backupCount=1, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(message)s", "%Y-%m-%d %H:%M:%S"))
    logger.addHandler(handler)

    def log(text=""):
        logger.info(text)
        print(text, flush=True)

    return log


def acquire_lock(path=LOCK_FILE):
    """Hält die Sperrdatei, solange der Prozess läuft. Gibt None zurück, wenn schon ein Worker läuft:
    Zwei Worker würden sich gegenseitig laufende Kurse zurücksetzen."""
    handle = open(path, "a+")
    try:
        if os.name == "nt":
            import msvcrt
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return None
    return handle


@contextlib.contextmanager
def keep_awake():
    """Während ein Kurs läuft, darf Windows nicht in den Ruhezustand gehen. Der Bildschirm darf aus."""
    if os.name != "nt":
        yield
        return
    import ctypes
    continuous, system_required = 0x80000000, 0x00000001
    state = ctypes.windll.kernel32.SetThreadExecutionState
    state(ctypes.c_uint(continuous | system_required))
    try:
        yield
    finally:
        state(ctypes.c_uint(continuous))


def run_forever(db, log=print):
    requeued = False
    last_blocker = None
    while True:
        try:
            if not requeued:
                requeue_running(db)
                requeued = True
            course = next_course(db)
            blocker = publish_blocker() if course else None
            if blocker != last_blocker and blocker:
                log(f"Warte mit dem nächsten Kurs: {blocker}")
            last_blocker = blocker
            if course and not blocker:
                with keep_awake():
                    process_course(db, course, log)
        except Exception as error:  # Im Hintergrund sieht niemand einen Absturz, also weiterlaufen.
            log(f"FEHLER: {error}")
            requeued = False  # falls das Ergebnis eines Kurses nicht eingetragen werden konnte
        time.sleep(POLL_SECONDS)


def main():
    if sys.stdout:  # Video-Titel können Zeichen enthalten, die das Fenster nicht kennt
        sys.stdout.reconfigure(errors="replace")
    lock = acquire_lock()
    if lock is None:
        print("Die Warteschlange läuft schon im Hintergrund. Die Ausgaben stehen in queue_worker.log.")
        return 0
    log = make_log()
    if not WRANGLER.exists():
        log("wrangler nicht gefunden. Bitte im Projektordner einmal `npm install` ausführen.")
        return 1
    log(f"Warteschlange läuft, Prüfung alle {POLL_SECONDS} Sekunden.")
    try:
        run_forever(Database(), log)
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
