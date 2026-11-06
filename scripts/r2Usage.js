// Belegung des R2-Buckets: Abfrage über wrangler und die eigene Liste der hochgeladenen Dateien.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUCKET } from './r2Limits.js';

export { ALERT_BYTES, BUCKET, formatGb, FREE_STORAGE_BYTES, monthlyCostUsd, PRICE_PER_GB_MONTH } from './r2Limits.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wranglerBin = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
export const statePath = join(root, 'downloader', 'downloads', '.uploaded.json');

// Liste der hochgeladenen Videos ({ Pfad: "Größe:Änderungszeit" })
export function loadUploadState() {
  return existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
}

export const uploadedBytes = (state) => Object.values(state).reduce((sum, stamp) => sum + Number(String(stamp).split(':')[0]), 0);

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
