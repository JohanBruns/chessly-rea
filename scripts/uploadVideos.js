// Lädt die Kursvideos, auf die die PGN-Dateien in openings/ verweisen, in den privaten R2-Bucket.
// Schon hochgeladene Dateien (gleiche Größe und Änderungszeit) werden übersprungen. Würde der Bucket
// dadurch größer als STORAGE_LIMIT_BYTES (unter der Gratis-Grenze), lädt das Skript gar nichts hoch.
// Aufruf: npm run upload-videos   (vorher einmal: npx wrangler login)
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { videoObjectKey } from '../functions/downloader/downloads/[[path]].js';
import { BUCKET, bucketUsage, formatGb, STORAGE_LIMIT_BYTES, wrangler } from './r2Usage.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = '/downloader/downloads/';
const statePath = join(root, 'downloader', 'downloads', '.uploaded.json');

export function referencedVideos(pgnTexts) {
  const keys = new Set();
  for (const text of pgnTexts) {
    for (const [, video] of text.matchAll(/^\[Video "(.*)"\]\s*$/gm)) {
      if (video.startsWith(PREFIX)) keys.add(video.slice(PREFIX.length));
    }
  }
  return [...keys].sort();
}

// Bucket-Größe nach dem Upload. wrangler meldet die Größe mit etwas Verzögerung, deshalb zählt auch
// die eigene Liste der hochgeladenen Dateien – es gilt der größere Wert.
export function projectedBytes({ remoteBytes, state, pending }) {
  const known = Object.values(state).reduce((sum, stamp) => sum + Number(String(stamp).split(':')[0]), 0);
  return Math.max(remoteBytes, known) + pending.reduce((sum, p) => sum + p.size, 0);
}

async function main() {
  const openings = join(root, 'openings');
  const pgns = readdirSync(openings)
    .filter((f) => f.endsWith('.pgn'))
    .map((f) => readFileSync(join(openings, f), 'utf8'));
  const keys = referencedVideos(pgns);
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const missing = [];
  const pending = [];
  for (const key of keys) {
    const file = join(root, 'downloader', 'downloads', key);
    if (!existsSync(file)) {
      missing.push(key);
      continue;
    }
    const { size, mtimeMs } = statSync(file);
    const stamp = `${size}:${Math.round(mtimeMs)}`;
    if (state[key] !== stamp) pending.push({ key, file, size, stamp });
  }

  const usage = bucketUsage();
  const projected = projectedBytes({ remoteBytes: usage.bytes, state, pending });
  console.log(`Bucket jetzt: ${formatGb(usage.bytes)}, nach dem Upload: ${formatGb(projected)} (Grenze ${formatGb(STORAGE_LIMIT_BYTES)})`);
  if (projected > STORAGE_LIMIT_BYTES) {
    console.error('Abbruch: Damit wäre der Bucket zu nah an der kostenlosen Grenze von 10 GB. Nichts wurde hochgeladen.');
    process.exitCode = 1;
    return;
  }

  let uploaded = 0;
  for (const [i, { key, file, size, stamp }] of pending.entries()) {
    console.log(`[${i + 1}/${pending.length}] ${key} (${(size / 1e6).toFixed(0)} MB)`);
    wrangler(['r2', 'object', 'put', `${BUCKET}/${await videoObjectKey(key)}`, '--file', file, '--content-type', 'video/mp4', '--remote'], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    state[key] = stamp;
    writeFileSync(statePath, JSON.stringify(state, null, 2));
    uploaded++;
  }

  console.log(`Fertig: ${uploaded} hochgeladen, ${keys.length - uploaded - missing.length} schon vorhanden.`);
  if (missing.length) console.warn(`Nicht gefunden (erst mit dem Downloader laden):\n  ${missing.join('\n  ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
