"""Lädt ein einzelnes Vimeo-Video mit yt-dlp als MP4 herunter."""

import re
import time
from pathlib import Path

import imageio_ffmpeg
import yt_dlp

from speed import DOWNLOADED, describe_transfer, format_speed


def safe_filename(text):
    """Entfernt Zeichen, die in Windows-Dateinamen nicht erlaubt sind."""
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    return text[:120] or "Ohne Titel"


class Stopped(Exception):
    pass


def download_video(vimeo_id, target_file, log, should_stop=lambda: False):
    """Lädt das Video mit der Vimeo-ID nach target_file (Pfad ohne Endung .mp4 oder mit).

    log ist eine Funktion, die Textzeilen ins GUI-Log schreibt.
    should_stop ist eine Funktion, die True zurückgibt, wenn der Nutzer "Stopp" geklickt hat.
    Gibt True zurück, wenn das Video jetzt (oder schon vorher) vollständig vorhanden ist.
    """
    target_file = Path(target_file).with_suffix(".mp4")
    if target_file.exists():
        log(f"  Schon vorhanden, übersprungen: {target_file.name}")
        return True

    target_file.parent.mkdir(parents=True, exist_ok=True)
    last_step = [-1]  # zuletzt gemeldeter 25-%-Schritt (Liste, damit progress_hook sie ändern kann)
    stream_start = [None]  # Beginn des laufenden Streams; gemessen wird nur die Ladezeit, nicht das Zusammenfügen
    measured = {"bytes": 0, "seconds": 0.0}

    def progress_hook(status):
        if should_stop():
            raise Stopped()
        # yt-dlp lädt Video und Audio getrennt, darum kommt "finished" zweimal.
        if status["status"] == "downloading":
            if stream_start[0] is None:
                stream_start[0] = time.monotonic()
            total = status.get("total_bytes") or status.get("total_bytes_estimate")
            if total:
                percent = min(int(status["downloaded_bytes"] * 100 / total), 100)
                # Nur alle 25 % ins Log schreiben, damit es übersichtlich bleibt.
                if percent // 25 > last_step[0]:
                    last_step[0] = percent // 25
                    speed = status.get("speed")
                    log(f"    {last_step[0] * 25} %" + (f" · {format_speed(speed)}" if speed else ""))
        elif status["status"] == "finished":
            last_step[0] = -1
            if stream_start[0] is not None:
                measured["seconds"] += time.monotonic() - stream_start[0]
                stream_start[0] = None
            measured["bytes"] += status.get("downloaded_bytes") or 0

    options = {
        # Chessly erlaubt das Vimeo-Video nur, wenn es "von chessly.com" kommt.
        "http_headers": {"Referer": "https://chessly.com/"},
        "ffmpeg_location": imageio_ffmpeg.get_ffmpeg_exe(),
        # Bestes Video + bestes Audio, zusammengefügt als MP4.
        "format": "bv*+ba/b",
        "merge_output_format": "mp4",
        "outtmpl": str(target_file.with_suffix("")) + ".%(ext)s",
        "progress_hooks": [progress_hook],
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "continuedl": True,  # Halb geladene Teile nach einem Abbruch weiterladen
        "retries": 10,
        "fragment_retries": 10,
    }

    with yt_dlp.YoutubeDL(options) as ydl:
        ydl.download([f"https://player.vimeo.com/video/{vimeo_id}"])

    if target_file.exists():
        DOWNLOADED.add(measured["bytes"])
        detail = f" ({describe_transfer(measured['bytes'], measured['seconds'])})" if measured["bytes"] else ""
        log(f"  Fertig: {target_file.name}{detail}")
        return True
    log(f"  FEHLER: Datei wurde nicht erstellt: {target_file.name}")
    return False
