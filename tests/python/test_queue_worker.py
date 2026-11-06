"""Tests für downloader/queue_worker.py – ohne wrangler, ohne Netz, ohne Download.

Aufruf im Projektordner:
    downloader\\.venv\\Scripts\\python.exe -m unittest discover -s tests/python
"""

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

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


def process(db, export, save=lambda name, log: None):
    worker.process_course(db, worker.next_course(db), lambda text: None, export, save)
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

    def test_sichert_nur_einen_veroeffentlichten_kurs(self):
        saved = []
        save = lambda name, log: saved.append(name)  # noqa: E731
        process(self.db, lambda links, log: published(False), save)
        self.assertEqual(saved, [])

        self.db.run(f"UPDATE course_requests SET status = 'queued' WHERE chessly_id = '{COURSE_ID}'")
        self.assertEqual(process(self.db, lambda links, log: published(), save)["status"], "done")
        self.assertEqual(saved, ["Kurs"])

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


class BackgroundTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(folder.cleanup)
        self.folder = Path(folder.name)

    def test_nur_ein_worker_gleichzeitig(self):
        path = self.folder / "worker.lock"
        first = worker.acquire_lock(path)
        self.assertIsNotNone(first)
        self.addCleanup(first.close)
        self.assertIsNone(worker.acquire_lock(path))
        first.close()
        second = worker.acquire_lock(path)
        self.assertIsNotNone(second)
        second.close()

    def test_log_landet_in_der_datei_auch_ohne_fenster(self):
        path = self.folder / "worker.log"
        log = worker.make_log(path)
        self.addCleanup(lambda: [h.close() for h in worker.logging.getLogger(f"queue_worker.{path}").handlers])
        with mock.patch.object(sys, "stdout", None):
            log("Queen's Gambit läuft")
        self.assertIn("Queen's Gambit läuft", path.read_text(encoding="utf-8"))

    def test_ruhezustand_wird_nur_waehrend_eines_kurses_verhindert(self):
        with worker.keep_awake():
            pass

    def test_unerwarteter_fehler_beendet_die_schleife_nicht(self):
        db = FakeDatabase()
        db.add()
        calls = []

        def next_course(database):
            calls.append(database)
            if len(calls) == 1:
                raise RuntimeError("kaputt")
            return None

        lines = []
        with mock.patch.object(worker, "next_course", next_course), \
                mock.patch.object(worker.time, "sleep", side_effect=[None, KeyboardInterrupt]):
            with self.assertRaises(KeyboardInterrupt):
                worker.run_forever(db, lines.append)
        self.assertEqual(len(calls), 2)
        self.assertIn("FEHLER: kaputt", lines)


def git(branch="main", status=""):
    def run(args, root):
        return branch + "\n" if args[0] == "rev-parse" else status
    return run


class FakeGit:
    def __init__(self, branch="main", status=" M openings/neu.pgn\n", fail=None):
        self.branch, self.status, self.fail = branch, status, fail
        self.calls = []

    def __call__(self, args, root):
        self.calls.append(args)
        if args[0] == self.fail:
            raise RuntimeError(f"{args[0]} kaputt")
        if args[0] == "rev-parse":
            return self.branch + "\n"
        return self.status if args[0] == "status" else ""

    def commands(self):
        return [args[0] for args in self.calls]


class SaveCourseTest(unittest.TestCase):
    def save(self, fake, name="Queen's Gambit"):
        lines = []
        worker.save_course(name, lines.append, ".", fake)
        return "\n".join(lines)

    def test_committet_nur_kursdateien_und_pusht_main(self):
        fake = FakeGit()
        self.save(fake)
        self.assertEqual(fake.commands(), ["rev-parse", "add", "status", "commit", "push"])
        self.assertEqual(fake.calls[1], ["add", "-A", "--", "openings", "downloader/lines"])
        self.assertEqual(fake.calls[3], ["commit", "-m", "feat: Kurs Queen's Gambit", "--", "openings", "downloader/lines"])
        self.assertEqual(fake.calls[4], ["push", "origin", "main"])

    def test_ohne_aenderung_kein_commit_aber_nachgeholter_push(self):
        fake = FakeGit(status="")
        self.save(fake)
        self.assertNotIn("commit", fake.commands())
        self.assertIn("push", fake.commands())

    def test_auf_einem_anderen_branch_wird_nichts_gesichert(self):
        fake = FakeGit(branch="feature")
        self.assertIn("feature", self.save(fake))
        self.assertEqual(fake.commands(), ["rev-parse"])

    def test_fehler_stoppen_den_kurs_nicht(self):
        for step in ("add", "commit", "push"):
            with self.subTest(step=step):
                self.assertIn(f"{step} kaputt", self.save(FakeGit(fail=step)))

    def test_commit_fehler_verhindert_den_push(self):
        fake = FakeGit(fail="commit")
        self.save(fake)
        self.assertNotIn("push", fake.commands())


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
