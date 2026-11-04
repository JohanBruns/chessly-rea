"""Tests für mehrere Kurse auf einmal: Links einlesen (chessly.py) und parallele Downloads (exporter.py).
Ohne Browser, ohne Netz – der eigentliche Download wird durch eine Attrappe ersetzt.

Aufruf im Projektordner:
    downloader\\.venv\\Scripts\\python.exe -m unittest discover -s tests/python
"""

import sys
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "downloader"))

from chessly import parse_course_links  # noqa: E402
from downloader import Stopped  # noqa: E402
from exporter import download_jobs  # noqa: E402

# Die Links, die zum Testen eingefügt wurden: 7 Zeilen, aber "The Gotham Dutch" steht zweimal drin.
PASTED = """
https://chessly.com/courses/775a4eea-5a50-47da-b7dd-5790ef829fbe
https://chessly.com/courses/8d12cef8-ec7a-421e-b7f5-19798e4255fc
https://chessly.com/courses/6bf79f35-d2a5-41b0-b100-0e7d4b23df14
https://chessly.com/skill-courses/237b3f02-cf07-4c70-a72c-52d701ec542a
https://chessly.com/courses/43d1eef6-783d-4a92-82f4-cffa73e21354
https://chessly.com/courses/6bf79f35-d2a5-41b0-b100-0e7d4b23df14
https://chessly.com/non-opening-courses/fd553528-dcac-4f4f-a735-774502af7612
"""


class ParseCourseLinksTest(unittest.TestCase):
    def test_removes_the_duplicate_and_keeps_the_order(self):
        links, ignored, duplicates = parse_course_links(PASTED)
        self.assertEqual(len(links), 6)
        self.assertEqual(duplicates, 1)
        self.assertEqual(ignored, [])
        self.assertEqual([link.rsplit("/", 1)[1][:8] for link in links],
                         ["775a4eea", "8d12cef8", "6bf79f35", "237b3f02", "43d1eef6", "fd553528"])

    def test_keeps_the_course_type_of_each_link(self):
        links, _, _ = parse_course_links(PASTED)
        self.assertEqual([link.split("/")[3] for link in links],
                         ["courses", "courses", "courses", "skill-courses", "courses", "non-opening-courses"])

    def test_accepts_other_separators_and_ignores_junk(self):
        text = ("chessly.com/courses/775a4eea-5a50-47da-b7dd-5790ef829fbe, hallo ;"
                "https://chessly.com/courses/8d12cef8-ec7a-421e-b7f5-19798e4255fc?x=1")
        links, ignored, duplicates = parse_course_links(text)
        self.assertEqual(len(links), 2)
        self.assertEqual(ignored, ["hallo"])
        self.assertEqual(duplicates, 0)

    def test_empty_text_has_no_links(self):
        self.assertEqual(parse_course_links("  \n "), ([], [], 0))


class DownloadJobsTest(unittest.TestCase):
    def jobs(self, count, plan=None):
        plan = plan if plan is not None else {"errors": 0}
        return plan, [(plan, str(1000 + i), Path(f"video{i}.mp4")) for i in range(count)]

    def run_jobs(self, jobs, download, workers=3, should_stop=lambda: False):
        lines = []
        download_jobs(jobs, lines.append, should_stop, workers, download)
        return lines

    def test_downloads_every_video_once(self):
        plan, jobs = self.jobs(5)
        seen = []
        self.run_jobs(jobs, lambda vid, target, log, stop: seen.append(vid) or True)
        self.assertEqual(sorted(seen), ["1000", "1001", "1002", "1003", "1004"])
        self.assertEqual(plan["errors"], 0)

    def test_runs_several_downloads_at_the_same_time_but_not_more_than_asked(self):
        _, jobs = self.jobs(8)
        lock = threading.Lock()
        running = {"now": 0, "max": 0}

        def download(vid, target, log, stop):
            with lock:
                running["now"] += 1
                running["max"] = max(running["max"], running["now"])
            time.sleep(0.05)
            with lock:
                running["now"] -= 1
            return True

        self.run_jobs(jobs, download, workers=3)
        self.assertGreaterEqual(running["max"], 2)
        self.assertLessEqual(running["max"], 3)

    def test_two_videos_really_overlap(self):
        _, jobs = self.jobs(2)
        meeting = threading.Barrier(2, timeout=5)

        def download(vid, target, log, stop):
            meeting.wait()  # klappt nur, wenn beide Downloads gleichzeitig laufen
            return True

        plan = jobs[0][0]
        self.run_jobs(jobs, download, workers=2)
        self.assertEqual(plan["errors"], 0)

    def test_one_worker_loads_one_after_another(self):
        _, jobs = self.jobs(4)
        order = []
        self.run_jobs(jobs, lambda vid, target, log, stop: order.append(vid) or True, workers=1)
        self.assertEqual(order, ["1000", "1001", "1002", "1003"])

    def test_counts_errors_per_course_and_keeps_going(self):
        first, second = {"errors": 0}, {"errors": 0}
        jobs = [(first, "1000", Path("a0.mp4")), (first, "1001", Path("a1.mp4")), (first, "1002", Path("a2.mp4")),
                (second, "2000", Path("b0.mp4")), (second, "2001", Path("b1.mp4"))]
        done = []

        def download(vid, target, log, stop):
            if vid == "1000":
                return False  # Datei wurde nicht erstellt
            if vid in ("1001", "2001"):
                raise RuntimeError("Vimeo antwortet nicht")
            done.append(vid)
            return True

        lines = self.run_jobs(jobs, download)
        self.assertEqual(first["errors"], 2)
        self.assertEqual(second["errors"], 1)
        self.assertEqual(sorted(done), ["1002", "2000"])  # die übrigen Videos laufen trotzdem durch
        self.assertTrue(any("Vimeo antwortet nicht" in line for line in lines))

    def test_stop_raises_stopped(self):
        _, jobs = self.jobs(4)
        with self.assertRaises(Stopped):
            self.run_jobs(jobs, lambda vid, target, log, stop: True, should_stop=lambda: True)

    def test_no_jobs_is_fine(self):
        self.assertEqual(self.run_jobs([], lambda *a: True), [])

    def test_prefixes_log_lines_with_the_video_when_loading_in_parallel(self):
        _, jobs = self.jobs(2)
        lines = self.run_jobs(jobs, lambda vid, target, log, stop: log("  50 %") or True, workers=2)
        self.assertTrue(any(line.strip().startswith("[video") and line.endswith("50 %") for line in lines))


if __name__ == "__main__":
    unittest.main()
