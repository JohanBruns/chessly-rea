"""Liest alle Kurse aus deinem Chessly-Konto und speichert sie als catalog.json.

Die App zeigt daraus die Kurse, die noch nicht in openings/ liegen – inklusive
„Bald verfügbar“ und ob die Videos schon im Ordner downloads/ sind.

Aufruf:  npm run catalog
Ergebnis: downloader/catalog.json
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from browser import PROJECT_DIR, open_browser
from chessly import NotLoggedIn
from downloader import safe_filename

API = "https://cag.chessly.com"
CATALOG_FILE = PROJECT_DIR / "catalog.json"
DOWNLOADS_DIR = PROJECT_DIR / "downloads"

# Wird im Browser ausgeführt, damit die Anfrage mit den gespeicherten Cookies und
# von chessly.com aus läuft (die API erlaubt nur diese Herkunft).
FETCH_SCRIPT = """async (paths) => {
  const out = {};
  for (const path of paths) {
    const response = await fetch('https://cag.chessly.com' + path, { credentials: 'include' });
    out[path] = { status: response.status, body: await response.text() };
  }
  return out;
}"""

PATHS = ["/beta/openings/courses", "/beta/legacy/courses", "/beta/courses/categories"]


def normalize_color(course):
    color = (course.get("color") or "").strip().lower()
    if color in ("w", "b"):
        return color
    tags = course.get("tags") or []
    if "White Openings" in tags:
        return "w"
    if "Black Openings" in tags:
        return "b"
    return None


def course_url(kind, course_id):
    if kind == "OPENING":
        return f"https://chessly.com/courses/{course_id}"
    return f"https://chessly.com/skill-courses/{course_id}"


def videos_downloaded(name):
    """Liegen zu diesem Kurs schon MP4-Dateien im Download-Ordner?"""
    folder = DOWNLOADS_DIR / safe_filename(name)
    if not folder.is_dir():
        return False
    return any(file.suffix.lower() == ".mp4" for file in folder.iterdir())


def fetch_catalog(page):
    answers = page.evaluate(FETCH_SCRIPT, PATHS)
    for path, answer in answers.items():
        if answer["status"] == 401:
            raise NotLoggedIn()
        if answer["status"] != 200:
            raise RuntimeError(f"{path}: HTTP {answer['status']} – {answer['body'][:200]}")

    openings = json.loads(answers["/beta/openings/courses"]["body"])
    skills = json.loads(answers["/beta/legacy/courses"]["body"])
    categories = json.loads(answers["/beta/courses/categories"]["body"])

    courses = []
    for kind, items in (("OPENING", openings), ("LEGACY", skills)):
        for item in items:
            name = item.get("name") or item.get("shortName") or item["id"]
            tags = item.get("tags") or []
            courses.append(
                {
                    "id": item["id"],
                    "name": name,
                    "shortName": item.get("shortName") or name,
                    "description": item.get("description") or "",
                    "type": kind,
                    "color": normalize_color(item),
                    "imageUrl": item.get("imageUrl"),
                    "tags": tags,
                    "createdAt": item.get("createdAt"),
                    "url": course_url(kind, item["id"]),
                    "comingSoon": "Coming soon" in tags,
                    "videosDownloaded": videos_downloaded(name),
                }
            )

    courses.sort(key=lambda course: (course["name"].lower(), course["id"]))
    known = {course["id"] for course in courses}
    groups = [
        {
            "category": group.get("category") or "",
            "courseIds": [entry["id"] for entry in group.get("courses") or [] if entry.get("id") in known],
        }
        for group in categories
    ]

    return {
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "https://chessly.com/courses",
        "courses": courses,
        "categories": [group for group in groups if group["courseIds"]],
    }


def main():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        context = open_browser(playwright, headless=True)
        page = context.pages[0] if context.pages else context.new_page()
        try:
            page.goto("https://chessly.com/courses", wait_until="domcontentloaded")
            if "/login" in page.url:
                raise NotLoggedIn()
            catalog = fetch_catalog(page)
        except NotLoggedIn:
            print('Nicht eingeloggt! Bitte zuerst im Downloader auf "Login" klicken.')
            sys.exit(1)
        finally:
            context.close()

    CATALOG_FILE.write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")
    openings = sum(1 for course in catalog["courses"] if course["type"] == "OPENING")
    skills = len(catalog["courses"]) - openings
    downloaded = sum(1 for course in catalog["courses"] if course["videosDownloaded"])
    print(f"Katalog: {openings} Eröffnungskurse, {skills} Skill-Kurse")
    print(f"Videos schon heruntergeladen: {downloaded}")
    print(f"Gespeichert: {CATALOG_FILE}")


if __name__ == "__main__":
    main()
