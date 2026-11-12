"""Tests für die Tempo-Anzeige und das Gesamttempo bei parallelen Downloads. Ohne Netz.

Aufruf im Projektordner:
    downloader\\.venv\\Scripts\\python.exe -m unittest discover -s tests/python
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "downloader"))

from exporter import download_jobs  # noqa: E402
from speed import DOWNLOADED, ByteCounter, describe_transfer, format_duration, format_size, format_speed  # noqa: E402


class FormatTest(unittest.TestCase):
    def test_size(self):
        self.assertEqual(format_size(54_000_000), "54 MB")
        self.assertEqual(format_size(2_340_000_000), "2,3 GB")

    def test_duration(self):
        self.assertEqual(format_duration(12.4), "12 s")
        self.assertEqual(format_duration(185), "3 min 05 s")

    def test_speed_in_megabytes_and_megabits(self):
        self.assertEqual(format_speed(4_500_000), "4,5 MB/s (36 Mbit/s)")

    def test_transfer_with_average(self):
        self.assertEqual(describe_transfer(54_000_000, 12), "54 MB in 12 s, Ø 4,5 MB/s (36 Mbit/s)")

    def test_transfer_too_short_to_measure_has_no_speed(self):
        self.assertEqual(describe_transfer(1_000_000, 0.1), "1 MB in 0 s")


class CounterTest(unittest.TestCase):
    def test_counts_up(self):
        counter = ByteCounter()
        counter.add(5)
        counter.add(7)
        self.assertEqual(counter.total, 12)


class DownloadSummaryTest(unittest.TestCase):
    def jobs(self, count):
        plan = {"errors": 0}
        return [(plan, str(i), Path(f"v{i}.mp4")) for i in range(count)]

    def test_logs_total_speed_when_bytes_were_loaded(self):
        def fake(vimeo_id, target, log, should_stop):
            DOWNLOADED.add(50_000_000)
            return True

        lines = []
        download_jobs(self.jobs(2), lines.append, lambda: False, workers=1, download=fake)
        summary = [line for line in lines if line.startswith("Download gesamt:")]
        self.assertEqual(len(summary), 1)
        self.assertIn("100 MB in", summary[0])

    def test_no_summary_when_nothing_was_loaded(self):
        lines = []
        download_jobs(self.jobs(2), lines.append, lambda: False, workers=1, download=lambda *a: True)
        self.assertFalse([line for line in lines if line.startswith("Download gesamt:")])


if __name__ == "__main__":
    unittest.main()
