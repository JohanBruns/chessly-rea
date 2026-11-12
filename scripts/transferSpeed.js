// Geschwindigkeit von Übertragungen schön ausgeben (Gegenstück zu downloader/speed.py).

export function formatSize(bytes) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1).replace('.', ',')} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

export function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
}

// 4 500 000 Bytes pro Sekunde → „4,5 MB/s (36 Mbit/s)“. Mbit/s steht dabei, weil Anbieter ihr Tempo so angeben.
export function formatSpeed(bytesPerSecond) {
  return `${(bytesPerSecond / 1e6).toFixed(1).replace('.', ',')} MB/s (${Math.round((bytesPerSecond * 8) / 1e6)} Mbit/s)`;
}

// „54 MB in 12 s, Ø 4,5 MB/s (36 Mbit/s)“ – bei weniger als einer halben Sekunde ohne Tempo, das wäre Zufall.
export function describeTransfer(bytes, ms) {
  const text = `${formatSize(bytes)} in ${formatDuration(ms)}`;
  return ms >= 500 ? `${text}, Ø ${formatSpeed((bytes / ms) * 1000)}` : text;
}
