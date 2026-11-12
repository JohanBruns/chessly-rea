"""Exportiert einen kompletten Chessly-Kurs: Videos, Linien und eine PGN für openings/.

Der Ablauf ist derselbe wie beim reinen Video-Download, nur dass zusätzlich die
Kapitel/Studies mit allen Varianten gelesen werden (lines.py) und daraus mit
scripts/buildFromChessly.js eine fertige PGN-Datei gebaut wird.
"""

import itertools
import json
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from browser import PROJECT_DIR, open_browser
from chessly import NotLoggedIn, collect_lessons, find_vimeo_id, parse_course_url
from downloader import Stopped, download_video, safe_filename
from lines import fetch_course
from publisher import publish_course
from speed import DOWNLOADED, describe_transfer

LINES_DIR = PROJECT_DIR / "lines"
ROOT_DIR = PROJECT_DIR.parent
CATALOG_FILE = PROJECT_DIR / "catalog.json"


def lesson_filename(lesson):
    """Dateiname eines Videos, identisch zum bisherigen Downloader."""
    return safe_filename(
        f"{lesson['chapter_no']:02d}-{lesson['lesson_no']:02d} "
        f"{lesson['chapter']} - {lesson['lesson']}"
    ) + ".mp4"


def catalog_entry(course_id):
    """Liefert den Katalog-Eintrag (Name, Farbe, Beschreibung) zu einer Kurs-ID."""
    if not CATALOG_FILE.exists():
        return {}
    try:
        data = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return next((c for c in data.get("courses", []) if c.get("id") == course_id), {})


def project_relative(path):
    """Pfad relativ zum Projektordner, für Log-Ausgaben und Git-Befehle."""
    try:
        return Path(path).resolve().relative_to(ROOT_DIR.resolve()).as_posix()
    except ValueError:
        return str(path)


def video_url(path):
    """Pfad, wie ihn die App in der PGN erwartet: /downloader/downloads/<Kurs>/<Datei>.mp4"""
    path = Path(path).resolve()
    try:
        return "/" + path.relative_to(ROOT_DIR.resolve()).as_posix()
    except ValueError:
        # Zielordner liegt außerhalb des Projekts – die App findet das Video dann nicht.
        return path.as_posix()


def attach_videos(course, lessons, course_dir):
    """Hängt an jede Study die Pfade ihrer Videos (Reihenfolge wie bei Chessly)."""
    by_study = {}
    for lesson in lessons:
        by_study.setdefault(lesson["study_id"], []).append(course_dir / lesson_filename(lesson))
    for chapter in course["chapters"]:
        for study in chapter["studies"]:
            study["videos"] = [video_url(path) for path in by_study.get(study["id"], [])]
    return course


def skill_course(course_id, course_name, lessons, course_dir, entry=None):
    """Kursdatei für einen Skill-Kurs. Chessly hat dort keine Linien: Jede Video-Lektion wird eine
    Study mit genau einem Video und ohne Varianten. Das Ergebnis ersetzt lines/<Kurs>.json und wird
    wie bei Eröffnungskursen von scripts/buildFromChessly.js zur PGN verarbeitet ("kind": "skill")."""
    entry = entry or {}
    chapters = []
    by_chapter = {}
    for lesson in lessons:
        chapter = by_chapter.get(lesson["chapter_id"])
        if chapter is None:
            chapter = {"id": lesson["chapter_id"], "name": lesson["chapter"],
                       "description": "", "studies": []}
            by_chapter[lesson["chapter_id"]] = chapter
            chapters.append(chapter)
        chapter["studies"].append({
            "id": lesson["lesson_id"],
            "name": lesson["lesson"],
            "url": lesson["url"],
            "hasVideo": True,
            "videos": [video_url(course_dir / lesson_filename(lesson))],
            "variations": [],
            "comments": {},
        })
    return {
        "id": course_id,
        "name": course_name or entry.get("name") or course_id,
        "description": entry.get("description") or "",
        "color": "",
        "kind": "skill",
        "url": entry.get("url") or f"https://chessly.com/skill-courses/{course_id}",
        "chapters": chapters,
    }


def write_lines(course):
    """Schreibt downloader/lines/<Kurs>.json und gibt den Pfad zurück."""
    LINES_DIR.mkdir(exist_ok=True)
    target = LINES_DIR / (safe_filename(course["name"]) + ".json")
    target.write_text(json.dumps(course, ensure_ascii=False, indent=1), encoding="utf-8")
    return target


def build_pgn(lines_file, log=print):
    """Ruft das Node-Skript auf, das aus den Linien eine PGN in openings/ baut.
    Gibt den Pfad der geschriebenen PGN zurück (oder None)."""
    script = ROOT_DIR / "scripts" / "buildFromChessly.js"
    if not script.exists():
        log(f"PGN-Builder nicht gefunden: {script}")
        return None
    try:
        result = subprocess.run(
            ["node", str(script), "--new", str(lines_file)],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError:
        log("Node.js nicht gefunden. Bitte Node installieren (für die PGN-Erzeugung).")
        return None
    saved = None
    for line in (result.stdout or "").splitlines():
        log(line)
        if line.startswith("PGN gespeichert:"):
            # Zeile: "PGN gespeichert: <Pfad> (<n> Kapitel, <m> Studies)"
            saved = line.split(":", 1)[1].split(" (", 1)[0].strip()
    if result.returncode != 0:
        for line in (result.stderr or "").splitlines():
            log(f"  {line}")
        return None
    return saved


DEFAULT_WORKERS = 3  # so viele Videos werden gleichzeitig geladen


def plan_course(page, course_url, target_dir, log, should_stop, full):
    """Schritt 1 im Browser: Lektionen, Vimeo-IDs und (bei Eröffnungskursen) alle Linien sammeln.
    Lädt noch nichts herunter. Gibt einen „Plan“ zurück, den die späteren Schritte ergänzen."""
    kind, course_id = parse_course_url(course_url)
    entry = catalog_entry(course_id)

    log("Öffne Kursseite ...")
    course_name, lessons = collect_lessons(page, course_url, log)
    course_dir = Path(target_dir) / safe_filename(course_name)
    plan = {"kind": kind, "course_id": course_id, "entry": entry, "url": course_url,
            "course_name": course_name, "course_dir": course_dir, "lessons": lessons,
            "jobs": [], "errors": 0, "lines_course": None, "lines_file": None, "pgn_path": None}
    if full and Path(target_dir).resolve() != (PROJECT_DIR / "downloads").resolve():
        log("Hinweis: Für die App müssen die Videos in downloader/downloads/ liegen. "
            "Bei einem anderen Zielordner findet sie die PGN später nicht.")

    for lesson in lessons:
        if should_stop():
            raise Stopped()
        file_name = lesson_filename(lesson)
        target_file = course_dir / file_name
        if target_file.exists():
            log(f"Schon vorhanden: {file_name}")
            continue
        log(f"Suche Video: {file_name}")
        vimeo_id = find_vimeo_id(page, lesson["url"])
        if vimeo_id:
            plan["jobs"].append((vimeo_id, target_file))
        else:
            log("  Kein Video auf dieser Seite - übersprungen.")

    if full:
        if kind != "opening":
            log("Skill-Kurs: Chessly hat dafür keine Studien-Linien. "
                "Er wird ein Video-Kurs: eine Study pro Lektion.")
        else:
            log("Lese Kapitel, Studies und Linien ...")
            lines_course = fetch_course(page, course_url, log)
            lines_course["description"] = (
                lines_course.get("description") or entry.get("description") or ""
            )
            lines_course["color"] = entry.get("color") or lines_course.get("color") or ""
            attach_videos(lines_course, lessons, course_dir)
            multi = [
                study["name"]
                for chapter in lines_course["chapters"]
                for study in chapter["studies"]
                if len(study.get("videos", [])) > 1
            ]
            if multi:
                log("Hinweis: Diese Studies haben mehrere Videos – die PGN verlinkt nur das erste: "
                    + ", ".join(multi))
            plan["lines_course"] = lines_course
            plan["lines_file"] = write_lines(lines_course)
            log(f"Linien gespeichert: {plan['lines_file']}")
    return plan


def download_jobs(jobs, log, should_stop, workers=DEFAULT_WORKERS, download=download_video):
    """Schritt 2: Lädt die Videos, bis zu `workers` gleichzeitig (auch über mehrere Kurse hinweg).

    jobs ist eine Liste von (plan, vimeo_id, target_file). Ein Fehler bei einem Video stoppt weder die
    anderen noch den Kurs, er wird in plan["errors"] gezählt. Wirft Stopped, wenn der Nutzer stoppt."""
    total = len(jobs)
    if not total:
        return
    workers = max(1, min(int(workers), total))
    numbers = itertools.count(1)
    lock = threading.Lock()

    def work(job):
        plan, vimeo_id, target_file = job
        if should_stop():
            raise Stopped()
        number = next(numbers)
        log(f"[{number}/{total}] Lade {target_file.name} (Vimeo {vimeo_id})")
        # Bei mehreren gleichzeitigen Downloads steht vor jeder Zeile, zu welchem Video sie gehört.
        label = target_file.stem[:38]
        video_log = (lambda text: log(f"    [{label}] {text.strip()}")) if workers > 1 else log
        try:
            if not download(vimeo_id, target_file, video_log, should_stop):
                with lock:
                    plan["errors"] += 1
        except Stopped:
            raise
        except Exception as error:
            if should_stop():
                raise Stopped()
            with lock:
                plan["errors"] += 1
            log(f"  FEHLER bei {target_file.name}: {error}")

    stopped = False
    bytes_before, started = DOWNLOADED.total, time.monotonic()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for future in [pool.submit(work, job) for job in jobs]:
            try:
                future.result()
            except Stopped:
                stopped = True
    loaded = DOWNLOADED.total - bytes_before
    if loaded:
        # Wanduhrzeit statt Summe der Einzelzeiten: bei parallelen Downloads ist das das echte Gesamttempo.
        log(f"Download gesamt: {describe_transfer(loaded, time.monotonic() - started)}")
    if stopped:
        raise Stopped()


def finish_course(plan, full, log):
    """Schritt 3: Kursdatei (Skill-Kurs) und PGN bauen, dann die Zusammenfassung des Kurses ausgeben."""
    kind, errors = plan["kind"], plan["errors"]
    course_dir, lessons = plan["course_dir"], plan["lessons"]

    # Skill-Kurs: Die Studies entstehen erst jetzt aus den Lektionen, damit nur Videos verlinkt werden,
    # die es wirklich gibt. Fehlt noch eins (Fehler beim Laden), wird nichts gebaut – der nächste Start
    # holt es nach und baut dann den ganzen Kurs.
    if full and kind != "opening":
        present = [lesson for lesson in lessons if (course_dir / lesson_filename(lesson)).exists()]
        if errors:
            log("Die Kursdatei wird erst gebaut, wenn alle Videos geladen sind.")
        elif not present:
            log("Keine Videos im Kurs gefunden – es gibt nichts zu bauen.")
        else:
            if len(present) < len(lessons):
                log(f"Hinweis: {len(lessons) - len(present)} Lektion(en) ohne Video sind nicht im Kurs.")
            plan["lines_course"] = skill_course(
                plan["course_id"], plan["course_name"], present, course_dir, plan["entry"])
            plan["lines_file"] = write_lines(plan["lines_course"])
            log(f"Kursdatei gespeichert: {plan['lines_file']}")

    if plan["lines_course"]:
        log("")
        log("Baue PGN für openings/ ...")
        plan["pgn_path"] = build_pgn(plan["lines_file"], log)

    log("")
    log(f"Fertig! Ordner: {course_dir}")
    if plan["lines_file"]:
        log(f"Linien: {plan['lines_file']}")
    if plan["lines_course"] and not plan["pgn_path"]:
        log("Die PGN wurde nicht neu geschrieben (Datei existiert schon oder Fehler). "
            "Für ein Update: npm run neuaufbau -- openings/<datei>.pgn")
    if errors:
        log(f"{errors} Video(s) mit Fehler. Einfach nochmal starten - "
            "fertige Videos werden übersprungen.")


def export_courses(course_urls, target_dir, log=print, should_stop=lambda: False, full=True,
                   publish=False, workers=DEFAULT_WORKERS):
    """Lädt einen oder mehrere Kurse. Mit full=True zusätzlich Linien + PGN für openings/ (Skill-Kurse
    werden Video-Kurse). Mit publish=True (nur zusammen mit full) einmal am Ende Videos nach R2 und App
    auf Cloudflare.

    Die Kurse werden nacheinander in einem Browser gelesen (der Login-Ordner verträgt nur einen Browser
    gleichzeitig); die Videos laden danach bis zu `workers` gleichzeitig. Ein Kurs, der sich nicht lesen
    lässt, stoppt die anderen nicht. Gibt {"courses": [Pläne], "failed": [(Link, Fehler)], "published": bool}
    zurück."""
    from playwright.sync_api import sync_playwright

    urls = list(course_urls)
    plans, failed = [], []

    # Schritt 1: Im Browser Lektionen, Vimeo-IDs und Linien sammeln.
    with sync_playwright() as p:
        context = open_browser(p, headless=True)
        page = context.pages[0] if context.pages else context.new_page()
        try:
            for number, url in enumerate(urls, start=1):
                if should_stop():
                    raise Stopped()
                if len(urls) > 1:
                    log("")
                    log(f"=== Kurs {number}/{len(urls)}: {url}")
                try:
                    plans.append(plan_course(page, url, target_dir, log, should_stop, full))
                except (NotLoggedIn, Stopped):
                    raise
                except Exception as error:
                    failed.append((url, error))
                    log(f"FEHLER bei diesem Kurs, es geht mit dem nächsten weiter: {error}")
        finally:
            context.close()

    # Schritt 2: Videos aller Kurse herunterladen, mehrere gleichzeitig.
    jobs = [(plan, vimeo_id, target_file) for plan in plans for vimeo_id, target_file in plan["jobs"]]
    if jobs:
        log("")
        log(f"Lade {len(jobs)} Video(s), bis zu {max(1, min(int(workers), len(jobs)))} gleichzeitig ...")
    download_jobs(jobs, log, should_stop, workers)

    # Schritt 3: Kursdateien und PGNs bauen.
    for number, plan in enumerate(plans, start=1):
        if len(plans) > 1:
            log("")
            log(f"=== {plan['course_name']} ({number}/{len(plans)}) ===")
        finish_course(plan, full, log)

    # Schritt 4: Einmal für alle Kurse Videos nach R2, App bauen und deployen. Auch wenn eine PGN schon
    # existiert, denn so lässt sich ein früher abgebrochener Kurs nachholen; upload-videos überspringt Fertiges.
    published = False
    if full and publish and plans:
        log("")
        if any(plan["errors"] for plan in plans):
            log("Veröffentlichen übersprungen: Erst müssen alle Videos fehlerfrei geladen sein.")
        elif not any(plan["lines_course"] for plan in plans):
            log("Veröffentlichen übersprungen: Es gibt keine Kursdatei für die App.")
        else:
            published = publish_course(log, should_stop)

    built = [plan for plan in plans if plan["pgn_path"]]
    if built:
        log("")
        if published:
            log("Zum Sichern im Repository:")
        else:
            log("Nächster Schritt – Videos in die Cloud, App veröffentlichen und die Kurse committen:")
            log("  npm run upload-videos")
            log("  npm run deploy")
        files = " ".join(f"{project_relative(plan['pgn_path'])} {project_relative(plan['lines_file'])}"
                         for plan in built)
        names = ", ".join(plan["course_name"] for plan in built)
        log(f"  git add {files}")
        log(f"  git commit -m \"{'Kurs' if len(built) == 1 else 'Kurse'}: {names}\"")

    if len(urls) > 1:
        log("")
        log(f"Zusammenfassung: {len(plans)} von {len(urls)} Kurs(en) gelesen"
            + (f", {len(failed)} fehlgeschlagen" if failed else "")
            + f", {sum(plan['errors'] for plan in plans)} Video(s) mit Fehler.")
        for url, error in failed:
            log(f"  Nicht gelesen: {url} ({error})")
    return {"courses": plans, "failed": failed, "published": published}


def export_course(course_url, target_dir, log=print, should_stop=lambda: False, full=True, publish=False):
    """Lädt einen Kurs (siehe export_courses). Gibt Name, Ordner, Kursdatei, PGN und Veröffentlichung zurück."""
    result = export_courses([course_url], target_dir, log, should_stop, full, publish)
    if result["failed"]:
        raise result["failed"][0][1]
    plan = result["courses"][0]
    return {"course_name": plan["course_name"], "course_dir": plan["course_dir"],
            "lines_file": plan["lines_file"], "pgn_path": plan["pgn_path"],
            "published": result["published"]}
