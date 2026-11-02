"""Findet alle Video-Lektionen eines Chessly-Kurses und deren Vimeo-IDs.

Es gibt zwei Arten von Kursen:
- Eröffnungskurse:  https://chessly.com/courses/<id>
  Kapitel -> Studies -> "Tiles". Ein Tile mit kind == "video" ist das Video der Study.
- Skill-Kurse:      https://chessly.com/skill-courses/<id>  (auch /non-opening-courses/<id>)
  Kapitel -> Lektionen. Eine Lektion mit lessonType == "VIDEO" ist ein Video.

Die Kursstruktur lesen wir aus der Antwort, die die Kursseite beim Laden selbst abruft.
Die Vimeo-ID lesen wir auf der jeweiligen Lektionsseite aus dem Vimeo-iframe.
"""

import re

BASE = "https://chessly.com"
COURSE_RE = re.compile(r"/(courses|skill-courses|non-opening-courses)/([0-9a-f-]{36})")
VIMEO_RE = re.compile(r"player\.vimeo\.com/video/(\d+)")


class NotLoggedIn(Exception):
    pass


def parse_course_url(url):
    """Gibt (kurs_typ, kurs_id) zurück, z.B. ("opening", "0897f49e-...")."""
    match = COURSE_RE.search(url)
    if not match:
        raise ValueError("Das sieht nicht wie ein Chessly-Kurs-Link aus.\n"
                         "Beispiel: https://chessly.com/courses/0897f49e-d26d-42f5-82e9-ce37307b760a")
    kind = "opening" if match.group(1) == "courses" else "skill"
    return kind, match.group(2)


def clean_name(name):
    """Macht aus "Chapter 1: Black Plays 2...Nf6" einfach "Black Plays 2...Nf6"."""
    return re.sub(r"^(Chapter|Study|Video|Lesson)\s*\d+\s*[:.\-]\s*", "", name).strip()


def by_index(items):
    return sorted(items, key=lambda item: item.get("index", 0))


def load_course_page(page, url, api_matches):
    """Öffnet die Kursseite und gibt die JSON-Antwort zurück, für die api_matches(url) True ist."""
    with page.expect_response(lambda r: api_matches(r.url) and r.ok, timeout=45000) as response_info:
        page.goto(url)
    if "/login" in page.url:
        raise NotLoggedIn()
    return response_info.value.json()


def collect_lessons(page, course_url, log):
    """Gibt (kursname, lektionen) zurück. Jede Lektion ist ein dict mit
    chapter_no, chapter, lesson_no, lesson und url."""
    kind, course_id = parse_course_url(course_url)
    lessons = []

    if kind == "opening":
        url = f"{BASE}/courses/{course_id}"
        tree = load_course_page(page, url, lambda u: u.endswith(f"/courses/{course_id}/tree"))
        for chapter_no, chapter in enumerate(by_index(tree["chapters"]), start=1):
            lesson_no = 0
            for study in by_index(chapter["studies"]):
                video_tiles = [t for t in by_index(study["tiles"]) if t["kind"] == "video"]
                for part, tile in enumerate(video_tiles, start=1):
                    lesson_no += 1
                    name = clean_name(study["name"])
                    if len(video_tiles) > 1:
                        name += f" (Teil {part})"
                    lessons.append({
                        "chapter_no": chapter_no,
                        "chapter": clean_name(chapter["name"]),
                        "lesson_no": lesson_no,
                        "lesson": name,
                        "url": f"{url}/chapters/{chapter['id']}/studies/{study['id']}"
                               f"/path-video?tileId={tile['id']}",
                    })
    else:
        url = f"{BASE}/skill-courses/{course_id}"
        course = load_course_page(page, url, lambda u: u.endswith(f"/skills/courses/{course_id}"))
        for chapter_no, chapter in enumerate(by_index(course["chapters"]), start=1):
            lesson_no = 0
            for lesson in by_index(chapter["lessons"]):
                if lesson.get("lessonType") != "VIDEO":
                    continue
                lesson_no += 1
                lessons.append({
                    "chapter_no": chapter_no,
                    "chapter": clean_name(chapter["name"]),
                    "lesson_no": lesson_no,
                    "lesson": clean_name(lesson["name"]),
                    "url": f"{url}/chapters/{chapter['id']}/lessons/{lesson['id']}",
                })

    # Der Seitentitel ist der Kursname, z.B. "The Dark Vienna".
    course_name = page.title() or course_id
    log(f"Kurs: {course_name} - {len(lessons)} Video-Lektionen gefunden.")
    return course_name, lessons


def find_vimeo_id(page, lesson_url):
    """Öffnet eine Lektionsseite und wartet, bis der Vimeo-Player geladen wird.
    Gibt die Vimeo-ID zurück, oder None, wenn die Seite kein Video hat."""
    found = []

    def on_request(request):
        match = VIMEO_RE.search(request.url)
        if match:
            found.append(match.group(1))

    page.on("request", on_request)
    try:
        page.goto(lesson_url)
        if "/login" in page.url:
            raise NotLoggedIn()
        # Bis zu 20 Sekunden auf den Vimeo-Player warten.
        for _ in range(40):
            if found:
                break
            page.wait_for_timeout(500)
    finally:
        page.remove_listener("request", on_request)

    if found:
        return found[0]
    # Zur Sicherheit noch direkt im iframe nachsehen.
    for src in page.eval_on_selector_all("iframe", "els => els.map(e => e.src)"):
        match = VIMEO_RE.search(src)
        if match:
            return match.group(1)
    return None
