"""Speichert Kapitel, Studies und alle Varianten (Züge + Kommentare) eines Chessly-Eröffnungskurses
als JSON-Datei – als Grundlage für den Abgleich mit den eigenen PGN-Dateien.

Aufruf:  .venv\\Scripts\\python lines.py <Kurs-Link> [<Kurs-Link> ...]
Ergebnis: lines/<Kursname>.json

Die Linien einer Study lädt Chessly auf der Seite .../studies/<id>/lines:
- /studies/<id>/moves     Stellung (FEN) -> Züge, jeder Zug gehört zu einer Variante (variationId)
- /studies/<id>/comments  Stellung (FEN) -> Kommentare mit Pfeilen
"""

import json
import sys

from browser import PROJECT_DIR, open_browser
from chessly import BASE, NotLoggedIn, by_index, clean_name, load_course_page, parse_course_url
from downloader import safe_filename

LINES_DIR = PROJECT_DIR / "lines"


def build_variations(moves):
    """Macht aus der Antwort von /moves eine Liste von Varianten (je eine Liste von Zügen),
    sortiert nach variationIndex."""
    by_variation = {}
    for entries in moves.values():
        for entry in entries:
            by_variation.setdefault(entry["variationId"], []).append(entry)

    variations = []
    for variation_id, entries in by_variation.items():
        next_move = {entry["fen"]: entry for entry in entries}
        targets = {entry["nextFen"] for entry in entries}
        # Die Variante beginnt in der Stellung, in die kein Zug dieser Variante führt.
        starts = [fen for fen in next_move if fen not in targets]
        fen = starts[0] if starts else entries[0]["fen"]
        line = []
        while fen in next_move and len(line) < len(entries):
            entry = next_move[fen]
            line.append({"fen": fen, "san": entry["san"], "nextFen": entry["nextFen"]})
            fen = entry["nextFen"]
        variations.append({
            "id": variation_id,
            "index": entries[0].get("variationIndex", 0),
            "startFen": line[0]["fen"] if line else None,
            "moves": line,
        })
    return sorted(variations, key=lambda v: v["index"])


def load_study(page, study_url, study_id):
    """Öffnet die Linien-Seite einer Study und gibt (moves, comments) zurück."""
    responses = {}

    def on_response(response):
        for name in ("moves", "comments"):
            if response.ok and response.url.endswith(f"/studies/{study_id}/{name}"):
                responses[name] = response.json()

    page.on("response", on_response)
    try:
        page.goto(study_url)
        if "/login" in page.url:
            raise NotLoggedIn()
        for _ in range(60):  # bis zu 30 Sekunden warten
            if len(responses) == 2:
                break
            page.wait_for_timeout(500)
    finally:
        page.remove_listener("response", on_response)
    if "moves" not in responses:
        raise RuntimeError(f"Keine Züge für Study {study_id} bekommen (Zugriff gesperrt?)")
    return responses["moves"], responses.get("comments", {})


def fetch_course(page, course_url, log=print):
    """Liest den ganzen Kurs und gibt ein dict mit Kapiteln, Studies und Varianten zurück."""
    kind, course_id = parse_course_url(course_url)
    if kind != "opening":
        raise ValueError("Der Abgleich geht nur mit Eröffnungskursen (chessly.com/courses/...).")
    url = f"{BASE}/courses/{course_id}"
    tree = load_course_page(page, url, lambda u: u.endswith(f"/courses/{course_id}/tree"))
    course_name = page.title() or course_id
    log(f"Kurs: {course_name}")

    chapters = []
    for chapter in by_index(tree["chapters"]):
        studies = []
        for study in by_index(chapter["studies"]):
            kinds = [tile["kind"] for tile in by_index(study["tiles"])]
            study_url = f"{url}/chapters/{chapter['id']}/studies/{study['id']}/lines"
            moves, comments = load_study(page, study_url, study["id"])
            variations = build_variations(moves)
            log(f"  {clean_name(chapter['name'])} / {clean_name(study['name'])}: "
                f"{len(variations)} Varianten")
            studies.append({
                "id": study["id"],
                "name": clean_name(study["name"]),
                "url": study_url,
                "tiles": kinds,
                "hasVideo": "video" in kinds,
                "variations": variations,
                "comments": comments,
            })
        chapters.append({"id": chapter["id"], "name": clean_name(chapter["name"]), "studies": studies})
    return {"id": course_id, "name": course_name, "url": url, "chapters": chapters}


def main(urls):
    from playwright.sync_api import sync_playwright

    LINES_DIR.mkdir(exist_ok=True)
    with sync_playwright() as p:
        context = open_browser(p, headless=True)
        page = context.pages[0] if context.pages else context.new_page()
        try:
            for course_url in urls:
                course = fetch_course(page, course_url)
                target = LINES_DIR / (safe_filename(course["name"]) + ".json")
                target.write_text(json.dumps(course, ensure_ascii=False, indent=1), encoding="utf-8")
                print(f"Gespeichert: {target}")
        except NotLoggedIn:
            print("Nicht eingeloggt! Bitte zuerst im Downloader auf \"Login\" klicken.")
            sys.exit(1)
        finally:
            context.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1:])
