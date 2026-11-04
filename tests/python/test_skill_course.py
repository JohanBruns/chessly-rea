"""Tests für skill_course() in downloader/exporter.py – Skill-Kurse als Kursdatei (ohne Browser, ohne Netz).

Aufruf im Projektordner:
    downloader\\.venv\\Scripts\\python.exe -m unittest discover -s tests/python
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "downloader"))

from exporter import skill_course  # noqa: E402

COURSE_DIR = Path(__file__).resolve().parents[2] / "downloader" / "downloads" / "Beginner Tactics"


def lesson(chapter_no, lesson_no, chapter, name, chapter_id, lesson_id):
    return {
        "chapter_no": chapter_no, "chapter": chapter, "chapter_id": chapter_id,
        "lesson_no": lesson_no, "lesson": name, "lesson_id": lesson_id,
        "url": f"https://chessly.com/skill-courses/c/chapters/{chapter_id}/lessons/{lesson_id}",
        "part": 1, "parts": 1,
    }


LESSONS = [
    lesson(1, 1, "Piece Interactions", "Attacks", "ch1", "l1"),
    lesson(1, 2, "Piece Interactions", "Defense", "ch1", "l2"),
    lesson(2, 1, "Tactics", "Forks/Double Attacks", "ch2", "l3"),
]


class SkillCourseTest(unittest.TestCase):
    def build(self, **kwargs):
        return skill_course("course-id", "Beginner Tactics", LESSONS, COURSE_DIR, **kwargs)

    def test_groups_lessons_by_chapter_in_order(self):
        course = self.build()
        self.assertEqual([c["name"] for c in course["chapters"]], ["Piece Interactions", "Tactics"])
        self.assertEqual([len(c["studies"]) for c in course["chapters"]], [2, 1])

    def test_every_lesson_becomes_a_study_with_one_video_and_no_lines(self):
        study = self.build()["chapters"][0]["studies"][0]
        self.assertEqual(study["id"], "l1")
        self.assertEqual(study["name"], "Attacks")
        self.assertEqual(study["variations"], [])
        self.assertEqual(study["comments"], {})
        self.assertEqual(
            study["videos"],
            ["/downloader/downloads/Beginner Tactics/01-01 Piece Interactions - Attacks.mp4"],
        )

    def test_video_path_matches_the_downloaded_file_name(self):
        # "/" ist im Dateinamen verboten und fehlt dort – der Pfad muss genau diese Datei treffen.
        study = self.build()["chapters"][1]["studies"][0]
        self.assertTrue(study["videos"][0].endswith("02-01 Tactics - ForksDouble Attacks.mp4"))

    def test_marks_the_course_as_skill_course_without_color(self):
        course = self.build()
        self.assertEqual(course["kind"], "skill")
        self.assertEqual(course["color"], "")
        self.assertEqual(course["id"], "course-id")

    def test_takes_description_and_url_from_the_catalog_entry(self):
        course = self.build(entry={"description": "Gabeln, Fesselungen ...", "url": "https://chessly.com/skill-courses/x"})
        self.assertEqual(course["description"], "Gabeln, Fesselungen ...")
        self.assertEqual(course["url"], "https://chessly.com/skill-courses/x")

    def test_falls_back_without_catalog_entry(self):
        course = self.build()
        self.assertEqual(course["description"], "")
        self.assertEqual(course["url"], "https://chessly.com/skill-courses/course-id")


if __name__ == "__main__":
    unittest.main()
