"""Lädt ein einzelnes Vimeo-Video mit yt-dlp als MP4 herunter."""

import re
import time
from pathlib import Path

import imageio_ffmpeg
import yt_dlp

from speed import DOWNLOADED, describe_transfer, format_speed

# Vimeo liefert jedes Video als HLS in Stücken von 6 Sekunden, und zwar über zwei Netze: Akamai („akfire“) und
# Fastly („fastly_skyfire“). Von selbst nimmt yt-dlp Fastly, und dort hängen einzelne Stücke oft Sekunden lang
# (gemessen: Ø 0,1–0,4 MB/s). Akamai lieferte dieselben Stücke mit 1–3 MB/s, mit 8 gleichzeitig mit 5–7 MB/s.
# Deshalb zuerst Akamai, und nur wenn es dort Bild oder Ton nicht gibt, die Auswahl wie bisher.
VIDEO_FORMAT = "bv*[format_id*=akfire]+ba[format_id*=akfire]/bv*+ba/b"
# So viele Stücke eines Videos laden gleichzeitig. Ein hängendes Stück hält dann die anderen nicht auf.
FRAGMENTS_AT_ONCE = 4
# Nach so vielen Sekunden ohne Daten gibt yt-dlp ein Stück auf und versucht es erneut (Standard: 20).
SOCKET_TIMEOUT_SECONDS = 15


def safe_filename(text):
    """Entfernt Zeichen, die in Windows-Dateinamen nicht erlaubt sind."""
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    return text[:120] or "Ohne Titel"


class Stopped(Exception):
    pass


def ytdl_options(target_file, progress_hook):
    return {
        # Chessly erlaubt das Vimeo-Video nur, wenn es "von chessly.com" kommt.
        "http_headers": {"Referer": "https://chessly.com/"},
        "ffmpeg_location": imageio_ffmpeg.get_ffmpeg_exe(),
        # Bestes Video + bestes Audio, zusammengefügt als MP4.
        "format": VIDEO_FORMAT,
        "merge_output_format": "mp4",
        "outtmpl": str(target_file.with_suffix("")) + ".%(ext)s",
        "progress_hooks": [progress_hook],
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "continuedl": True,  # Halb geladene Teile nach einem Abbruch weiterladen
        "retries": 10,
        "fragment_retries": 10,
        "concurrent_fragment_downloads": FRAGMENTS_AT_ONCE,
        "socket_timeout": SOCKET_TIMEOUT_SECONDS,
    }


def stream_kind(status):
    """yt-dlp lädt Bild und Ton nacheinander; ohne Video-Codec ist es der Ton."""
    return "Audio" if (status.get("info_dict") or {}).get("vcodec") == "none" else "Video"


def progress_line(status, seconds, last_step):
    """Zeile fürs Log bei jedem neuen 25-%-Schritt, sonst None. Das Tempo ist der Durchschnitt seit Beginn
    des Streams: Der Momentwert von yt-dlp springt bei HLS mit jedem Stück und sagt wenig."""
    total = status.get("total_bytes") or status.get("total_bytes_estimate")
    if not total:
        return None, last_step
    downloaded = status.get("downloaded_bytes") or 0
    step = min(int(downloaded * 100 / total), 100) // 25
    if step < 1 or step <= last_step:
        return None, last_step
    line = f"    {stream_kind(status)} {step * 25} %"
    if seconds >= 0.5 and downloaded:
        line += f" · Ø {format_speed(downloaded / seconds)}"
    return line, step


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
    last_step = [0]  # zuletzt gemeldeter 25-%-Schritt (Liste, damit progress_hook sie ändern kann)
    stream_start = [None]  # Beginn des laufenden Streams; gemessen wird nur die Ladezeit, nicht das Zusammenfügen
    measured = {"bytes": 0, "seconds": 0.0}

    def progress_hook(status):
        if should_stop():
            raise Stopped()
        # yt-dlp lädt Video und Audio getrennt, darum kommt "finished" zweimal.
        if status["status"] == "downloading":
            if stream_start[0] is None:
                stream_start[0] = time.monotonic()
            line, last_step[0] = progress_line(status, time.monotonic() - stream_start[0], last_step[0])
            if line:
                log(line)
        elif status["status"] == "finished":
            last_step[0] = 0
            if stream_start[0] is not None:
                measured["seconds"] += time.monotonic() - stream_start[0]
                stream_start[0] = None
            measured["bytes"] += status.get("downloaded_bytes") or 0

    with yt_dlp.YoutubeDL(ytdl_options(target_file, progress_hook)) as ydl:
        ydl.download([f"https://player.vimeo.com/video/{vimeo_id}"])

    if target_file.exists():
        DOWNLOADED.add(measured["bytes"])
        detail = f" ({describe_transfer(measured['bytes'], measured['seconds'])})" if measured["bytes"] else ""
        log(f"  Fertig: {target_file.name}{detail}")
        return True
    log(f"  FEHLER: Datei wurde nicht erstellt: {target_file.name}")
    return False
