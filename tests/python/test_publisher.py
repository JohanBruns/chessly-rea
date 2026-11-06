"""Tests für downloader/publisher.py – ohne npm, ohne Netz (der Befehlsaufruf wird ersetzt).

Aufruf im Projektordner:
    downloader\\.venv\\Scripts\\python.exe -m unittest discover -s tests/python
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "downloader"))

from downloader import Stopped  # noqa: E402
from publisher import STEPS, failure_hint, publish_course  # noqa: E402


class FakeNpm:
    """Merkt sich die Aufrufe und liefert vorbereitete (Code, Ausgabe)-Antworten."""

    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls = []

    def __call__(self, args, cwd, log, should_stop=lambda: False):
        self.calls.append(args)
        return self.answers.pop(0)


class PublishCourseTest(unittest.TestCase):
    def run_publish(self, npm, should_stop=lambda: False):
        lines = []
        ok = publish_course(lines.append, should_stop, run=npm, root=Path("."))
        return ok, "\n".join(lines)

    def test_uploads_first_then_deploys(self):
        npm = FakeNpm((0, []), (0, []))
        ok, log = self.run_publish(npm)
        self.assertTrue(ok)
        self.assertEqual(npm.calls, [["run", "upload-videos"], ["run", "deploy"]])
        self.assertIn("Veröffentlicht!", log)

    def test_steps_stay_in_that_order(self):
        self.assertEqual([args for _, args in STEPS], [["run", "upload-videos"], ["run", "deploy"]])

    def test_failed_upload_skips_the_deploy(self):
        npm = FakeNpm((1, ["Abbruch: Damit wäre der Bucket größer als die Upload-Sperre von 25.00 GB."]))
        ok, log = self.run_publish(npm)
        self.assertFalse(ok)
        self.assertEqual(npm.calls, [["run", "upload-videos"]])
        self.assertIn("Bucket ist zu voll", log)
        self.assertNotIn("Veröffentlicht!", log)

    def test_failed_deploy_is_reported(self):
        npm = FakeNpm((0, []), (1, ["build failed"]))
        ok, log = self.run_publish(npm)
        self.assertFalse(ok)
        self.assertIn("`npm run deploy` ist mit Code 1 beendet worden", log)

    def test_missing_npm_is_explained(self):
        npm = FakeNpm((127, ["npm nicht gefunden"]))
        ok, log = self.run_publish(npm)
        self.assertFalse(ok)
        self.assertIn("Node.js installieren", log)

    def test_stop_before_a_step_raises(self):
        npm = FakeNpm()
        with self.assertRaises(Stopped):
            self.run_publish(npm, should_stop=lambda: True)
        self.assertEqual(npm.calls, [])


class FailureHintTest(unittest.TestCase):
    def test_not_logged_in_points_to_wrangler_login(self):
        hint = failure_hint(["You are not authenticated. Please run `wrangler login`."])
        self.assertIn("npx wrangler login", hint)

    def test_unknown_error_has_no_hint(self):
        self.assertIsNone(failure_hint(["something else went wrong"]))


if __name__ == "__main__":
    unittest.main()
