"""Tests für downloader/queue_worker.py – ohne wrangler, ohne Netz, ohne Download.

Aufruf im Projektordner:
    downloader\\.venv\\Scripts\\python.exe -m unittest discover -s tests/python
"""

import sqlite3
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "downloader"))

from chessly import NotLoggedIn  # noqa: E402
import queue_worker as worker  # noqa: E402

COURSE_ID = "0897f49e-d26d-42f5-82e9-ce37307b760a"
COURSE_URL = f"https://chessly.com/courses/{COURSE_ID}"


class FakeDatabase:
    """Echtes SQLite im Speicher mit der echten Migration; nur der Weg über wrangler fehlt."""

    def __init__(self):
        self.connection = sqlite3.connect(":memory:")
        self.connection.row_factory = sqlite3.Row
        self.connection.executescript((ROOT / "migrations" / "0001_accounts.sql").read_text(encoding="utf-8"))
        self.connection.executescript((ROOT / "migrations" / "0004_course_requests.sql").read_text(encoding="utf-8"))

    def run(self, sql):
        return [dict(row) for row in self.connection.execute(sql).fetchall()]

    def add(self, course_id=COURSE_ID, url=COURSE_URL, status="queued", requested_at=1, name="Kurs"):
        self.connection.execute(
            "INSERT INTO course_requests (chessly_id, name, url, status, requested_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, 0)", (course_id, name, url, status, requested_at))

    def row(self, course_id=COURSE_ID):
        return self.run(f"SELECT status, message FROM course_requests WHERE chessly_id = '{course_id}'")[0]


def published(ok=True, failed=(), errors=0):
    return {"courses": [{"errors": errors}], "failed": list(failed), "published": ok}


def process(db, export):
    worker.process_course(db, worker.next_course(db), lambda text: None, export)
    return db.row()


class ProcessCourseTest(unittest.TestCase):
    def setUp(self):
        self.db = FakeDatabase()
        self.db.add()

    def test_veroeffentlichter_kurs_ist_fertig(self):
        seen = {}

        def export(links, log):
            seen["links"] = links
            seen["status"] = self.db.row()["status"]
            return published()

        self.assertEqual(process(self.db, export), {"status": "done", "message": None})
        self.assertEqual(seen, {"links": [COURSE_URL], "status": "running"})

    def test_fehler_stehen_verstaendlich_in_der_app(self):
        cases = [
            (published(False, failed=[(COURSE_URL, "kaputt")]), worker.READ_FAILED),
            (published(False, errors=2), "2 Video(s) konnten nicht geladen werden."),
            (published(False), worker.PUBLISH_FAILED),
        ]
        for result, message in cases:
            with self.subTest(message=message):
                self.db.run(f"UPDATE course_requests SET status = 'queued' WHERE chessly_id = '{COURSE_ID}'")
                self.assertEqual(process(self.db, lambda links, log: result),
                                 {"status": "failed", "message": message})

    def test_abgelaufener_login(self):
        def export(links, log):
            raise NotLoggedIn()

        self.assertEqual(process(self.db, export), {"status": "failed", "message": worker.NOT_LOGGED_IN})

    def test_unerwarteter_fehler_gibt_keine_interna_preis(self):
        def export(links, log):
            raise RuntimeError(r"C:\Users\geheim\browser_profile ist gesperrt")

        self.assertEqual(process(self.db, export), {"status": "failed", "message": worker.UNEXPECTED})

    def test_ungueltiger_link_startet_keinen_download(self):
        db = FakeDatabase()
        db.add(url="https://example.com/nichts")

        def export(links, log):
            self.fail("darf nicht laden")

        self.assertEqual(process(db, export), {"status": "failed", "message": worker.BAD_LINK})


class QueueTest(unittest.TestCase):
    def test_nimmt_den_aeltesten_wartenden_kurs(self):
        db = FakeDatabase()
        db.add(course_id="spaeter", requested_at=9)
        db.add(course_id="zuerst", requested_at=2)
        db.add(course_id="kaputt", status="failed", requested_at=1)
        db.add(course_id="fertig", status="done", requested_at=1)
        self.assertEqual(worker.next_course(db)["chessly_id"], "zuerst")

    def test_leere_warteschlange(self):
        self.assertIsNone(worker.next_course(FakeDatabase()))

    def test_abgebrochener_kurs_kommt_wieder_dran(self):
        db = FakeDatabase()
        db.add(status="running")
        worker.requeue_running(db)
        self.assertEqual(db.row()["status"], "queued")

    def test_sql_text_schuetzt_anfuehrungszeichen(self):
        db = FakeDatabase()
        db.add()
        worker.set_status(db, COURSE_ID, "failed", "Queen's Gambit'; DROP TABLE course_requests; --")
        self.assertEqual(db.row()["message"], "Queen's Gambit'; DROP TABLE course_requests; --")
        self.assertEqual(worker.sql_text(None), "NULL")


def git(branch="main", status=""):
    def run(args, root):
        return branch + "\n" if args[0] == "rev-parse" else status
    return run


class PublishBlockerTest(unittest.TestCase):
    def test_sauberer_stand_darf_veroeffentlichen(self):
        self.assertIsNone(worker.publish_blocker(".", git()))

    def test_kursdateien_halten_nicht_auf(self):
        status = "?? openings/neu.pgn\0?? downloader/lines/Neu.json\0 M downloader/catalog.json\0"
        self.assertIsNone(worker.publish_blocker(".", git(status=status)))

    def test_nicht_committeter_code_haelt_auf(self):
        status = " M src/app.js\0?? openings/neu.pgn\0"
        message = worker.publish_blocker(".", git(status=status))
        self.assertIn("1 Datei(en)", message)
        self.assertIn("src/app.js", message)

    def test_nur_von_main(self):
        self.assertIn("feature", worker.publish_blocker(".", git(branch="feature")))

    def test_ohne_git_wird_nichts_veroeffentlicht(self):
        def broken(args, root):
            raise RuntimeError("not a git repository")

        self.assertIn("not a git repository", worker.publish_blocker(".", broken))


if __name__ == "__main__":
    unittest.main()
