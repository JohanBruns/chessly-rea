"""Tests für downloader/downloader.py: Auswahl des Vimeo-Netzes und die Fortschrittszeilen – ohne Netz.

Aufruf im Projektordner:
    downloader\\.venv\\Scripts\\python.exe -m unittest discover -s tests/python
"""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "downloader"))

import yt_dlp  # noqa: E402

import downloader  # noqa: E402

# So meldet Vimeo die Formate eines Chessly-Videos (gekürzt auf das, was die Auswahl braucht).
VIMEO_FORMATS = [
    {"format_id": f"hls-{cdn}-{kind}", "ext": "mp4", "protocol": "m3u8_native", "url": f"https://{cdn}/{kind}",
     **({"vcodec": "none", "acodec": "mp4a"} if kind.startswith("audio") else
        {"vcodec": "avc1", "acodec": "none", "height": height, "tbr": tbr})}
    for cdn in ("akfire_interconnect_quic", "fastly_skyfire")
    for kind, height, tbr in (("audio-high-English", None, None), ("569", 720, 569), ("967", 1080, 967))
]


def chosen(formats):
    """Lässt yt-dlp mit den echten Optionen auswählen, ohne etwas zu laden."""
    options = {**downloader.ytdl_options(Path("x.mp4"), lambda status: None), "simulate": True}
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.process_ie_result({"id": "1", "title": "x", "extractor": "vimeo", "extractor_key": "Vimeo",
                                      "webpage_url": "https://player.vimeo.com/video/1", "formats": formats},
                                     download=False)
    return [part["format_id"] for part in info.get("requested_formats", [info])]


class FormatTest(unittest.TestCase):
    def test_bestes_bild_und_ton_von_akamai(self):
        self.assertEqual(chosen(VIMEO_FORMATS),
                         ["hls-akfire_interconnect_quic-967", "hls-akfire_interconnect_quic-audio-high-English"])

    def test_ohne_akamai_wie_bisher(self):
        fastly = [entry for entry in VIMEO_FORMATS if "fastly" in entry["format_id"]]
        self.assertEqual(chosen(fastly), ["hls-fastly_skyfire-967", "hls-fastly_skyfire-audio-high-English"])

    def test_stuecke_laden_gleichzeitig(self):
        options = downloader.ytdl_options(Path("x.mp4"), lambda status: None)
        self.assertEqual(options["concurrent_fragment_downloads"], downloader.FRAGMENTS_AT_ONCE)
        self.assertEqual(options["format"], downloader.VIDEO_FORMAT)
        self.assertEqual(options["http_headers"], {"Referer": "https://chessly.com/"})


def status(downloaded, total=100_000_000, vcodec="avc1"):
    return {"status": "downloading", "downloaded_bytes": downloaded, "total_bytes": total, "info_dict": {"vcodec": vcodec}}


class ProgressLineTest(unittest.TestCase):
    def test_keine_zeile_bei_null_prozent(self):
        self.assertEqual(downloader.progress_line(status(0), 0.0, 0), (None, 0))
        self.assertEqual(downloader.progress_line(status(10_000_000), 2.0, 0), (None, 0))

    def test_zeile_mit_art_und_durchschnitt(self):
        line, step = downloader.progress_line(status(25_000_000), 10.0, 0)
        self.assertEqual(line, "    Video 25 % · Ø 2,5 MB/s (20 Mbit/s)")
        self.assertEqual(step, 1)

    def test_ton_heisst_audio(self):
        line, _ = downloader.progress_line(status(3_000_000, 4_000_000, vcodec="none"), 1.0, 0)
        self.assertTrue(line.startswith("    Audio 75 %"))

    def test_jeder_schritt_nur_einmal(self):
        self.assertEqual(downloader.progress_line(status(30_000_000), 10.0, 1), (None, 1))
        line, step = downloader.progress_line(status(100_000_000), 10.0, 1)
        self.assertIn("100 %", line)
        self.assertEqual(step, 4)

    def test_ohne_groesse_keine_zeile(self):
        self.assertEqual(downloader.progress_line({"downloaded_bytes": 5}, 1.0, 0), (None, 0))


if __name__ == "__main__":
    unittest.main()
