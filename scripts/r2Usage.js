// Kostenschutz für den R2-Bucket: Der kostenlose Tarif enthält 10 GB Speicher pro Monat.
// Wir bleiben mit 8 GB deutlich darunter – das Upload-Skript bricht ab, bevor es die Grenze reißt.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUCKET = 'chessly-rea-videos';
export const FREE_STORAGE_BYTES = 10e9;
export const STORAGE_LIMIT_BYTES = 8e9;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wranglerBin = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

// wrangler direkt über Node starten: ohne Shell bleiben Leerzeichen und & in Dateinamen unversehrt
export function wrangler(args, options = {}) {
  return execFileSync(process.execPath, [wranglerBin, ...args], { encoding: 'utf8', ...options });
}

const UNITS = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KIB: 2 ** 10, MIB: 2 ** 20, GIB: 2 ** 30, TIB: 2 ** 40 };

// „1.23 GB“ (Ausgabe von wrangler r2 bucket info) → Bytes
export function parseSize(text) {
  const m = /^\s*([\d.]+)\s*([a-z]+)\s*$/i.exec(String(text));
  const factor = m && UNITS[m[2].toUpperCase()];
  if (!factor) throw new Error(`Unbekannte Größenangabe: ${text}`);
  return Math.round(Number(m[1]) * factor);
}

export function bucketUsage() {
  const out = wrangler(['r2', 'bucket', 'info', BUCKET, '--json'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const info = JSON.parse(out.slice(out.indexOf('{')));
  return { bytes: parseSize(info.bucket_size), objects: Number(info.object_count) };
}

export const formatGb = (bytes) => `${(bytes / 1e9).toFixed(2)} GB`;
