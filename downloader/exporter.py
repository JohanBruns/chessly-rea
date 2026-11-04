"""Exportiert einen kompletten Chessly-Kurs: Videos, Linien und eine PGN für openings/.

Der Ablauf ist derselbe wie beim reinen Video-Download, nur dass zusätzlich die
Kapitel/Studies mit allen Varianten gelesen werden (lines.py) und daraus mit
scripts/buildFromChessly.js eine fertige PGN-Datei gebaut wird.
"""

import json
import subprocess
from pathlib import Path

from browser import PROJECT_DIR, open_browser
from chessly import collect_lessons, find_vimeo_id, parse_course_url
from downloader import Stopped, download_video, safe_filename
from lines import fetch_course
from publisher import publish_course

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


def export_course(course_url, target_dir, log=print, should_stop=lambda: False, full=True, publish=False):
    """Lädt einen Kurs. Mit full=True zusätzlich Linien + PGN für openings/.
    Mit publish=True (nur zusammen mit full) danach Videos nach R2 und die App auf Cloudflare."""
    from playwright.sync_api import sync_playwright

    kind, course_id = parse_course_url(course_url)
    entry = catalog_entry(course_id)
    course_dir = None
    lines_course = None
    lines_file = None
    jobs = []

    # Schritt 1: Im Browser Lektionen, Vimeo-IDs und (optional) alle Linien sammeln.
    with sync_playwright() as p:
        context = open_browser(p, headless=True)
        page = context.pages[0] if context.pages else context.new_page()
        try:
            log("Öffne Kursseite ...")
            course_name, lessons = collect_lessons(page, course_url, log)
            course_dir = Path(target_dir) / safe_filename(course_name)
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
                    jobs.append((vimeo_id, target_file))
                else:
                    log("  Kein Video auf dieser Seite - übersprungen.")

            if full:
                if kind != "opening":
                    log("Skill-Kurs: Chessly hat dafür keine Studien-Linien. "
                        "Es werden nur die Videos geladen.")
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
                    lines_file = write_lines(lines_course)
                    log(f"Linien gespeichert: {lines_file}")
        finally:
            context.close()

    # Schritt 2: Videos herunterladen. Fehler bei einem Video stoppen nicht den ganzen Kurs.
    errors = 0
    for number, (vimeo_id, target_file) in enumerate(jobs, start=1):
        if should_stop():
            raise Stopped()
        log(f"[{number}/{len(jobs)}] Lade {target_file.name} (Vimeo {vimeo_id})")
        try:
            if not download_video(vimeo_id, target_file, log, should_stop):
                errors += 1
        except Exception as error:
            if should_stop():
                raise Stopped()
            errors += 1
            log(f"  FEHLER: {error}")

    # Schritt 3: PGN aus den Linien bauen.
    pgn_path = None
    if lines_course:
        log("")
        log("Baue PGN für openings/ ...")
        pgn_path = build_pgn(lines_file, log)

    log("")
    log(f"Fertig! Ordner: {course_dir}")
    if lines_file:
        log(f"Linien: {lines_file}")
    if lines_course and not pgn_path:
        log("Die PGN wurde nicht neu geschrieben (Datei existiert schon oder Fehler). "
            "Für ein Update: npm run neuaufbau -- openings/<datei>.pgn")
    if errors:
        log(f"{errors} Video(s) mit Fehler. Einfach nochmal starten - "
            "fertige Videos werden übersprungen.")

    # Schritt 4: Videos nach R2, App bauen und deployen. Auch wenn die PGN schon existiert, denn
    # so lässt sich ein früher abgebrochener Kurs nachholen; upload-videos überspringt Fertiges.
    published = False
    if full and publish:
        if errors:
            log("Veröffentlichen übersprungen: Erst müssen alle Videos fehlerfrei geladen sein.")
        elif not lines_course:
            log("Veröffentlichen übersprungen: Nur Eröffnungskurse mit PGN erscheinen in der App.")
        else:
            published = publish_course(log, should_stop)

    if pgn_path:
        if published:
            log("Zum Sichern im Repository:")
        else:
            log("Nächster Schritt – Videos in die Cloud, App veröffentlichen und den Kurs committen:")
            log("  npm run upload-videos")
            log("  npm run deploy")
        log(f"  git add {project_relative(pgn_path)} {project_relative(lines_file)}")
        log(f"  git commit -m \"Kurs: {course_name}\"")
    return {"course_name": course_name, "course_dir": course_dir,
            "lines_file": lines_file, "pgn_path": pgn_path, "published": published}
