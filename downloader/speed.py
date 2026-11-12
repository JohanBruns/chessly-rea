"""Geschwindigkeit von Übertragungen: Zahlen schön formatieren und die geladenen Bytes mitzählen."""

import threading


def format_size(num_bytes):
    """54_000_000 -> "54 MB", 2_300_000_000 -> "2,3 GB" (Dezimalkomma, 1 MB = 1 Mio. Bytes)."""
    if num_bytes >= 1e9:
        return f"{num_bytes / 1e9:.1f} GB".replace(".", ",")
    return f"{num_bytes / 1e6:.0f} MB"


def format_duration(seconds):
    seconds = max(0, round(seconds))
    if seconds < 60:
        return f"{seconds} s"
    minutes, rest = divmod(seconds, 60)
    return f"{minutes} min {rest:02d} s"


def format_speed(bytes_per_second):
    """4_500_000 -> "4,5 MB/s (36 Mbit/s)". Mbit/s steht dabei, weil Anbieter ihr Tempo so angeben."""
    return f"{bytes_per_second / 1e6:.1f} MB/s ({bytes_per_second * 8 / 1e6:.0f} Mbit/s)".replace(".", ",", 1)


def describe_transfer(num_bytes, seconds):
    """"54 MB in 12 s, Ø 4,5 MB/s (36 Mbit/s)" – oder nur Größe und Zeit, wenn die Zeit zu kurz zum Messen ist."""
    text = f"{format_size(num_bytes)} in {format_duration(seconds)}"
    if seconds >= 0.5:
        text += f", Ø {format_speed(num_bytes / seconds)}"
    return text


class ByteCounter:
    """Zählt geladene Bytes aus mehreren Download-Threads."""

    def __init__(self):
        self._lock = threading.Lock()
        self._total = 0

    def add(self, num_bytes):
        with self._lock:
            self._total += num_bytes

    @property
    def total(self):
        with self._lock:
            return self._total


# Alle Videodownloads zählen hier mit, download_jobs misst damit das Gesamttempo.
DOWNLOADED = ByteCounter()
