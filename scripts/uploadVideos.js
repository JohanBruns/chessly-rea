// Lädt die Kursvideos, auf die die PGN-Dateien in openings/ verweisen, in den privaten R2-Bucket.
// Schon hochgeladene Dateien (gleiche Größe und Änderungszeit) werden übersprungen.
// Aufruf: npm run upload-videos   (vorher einmal: npx wrangler login)
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { videoObjectKey } from '../functions/downloader/downloads/[[path]].js';
import { describeTransfer } from './transferSpeed.js';
import { BUCKET, bucketUsage, formatGb, loadUploadState, monthlyCostUsd, statePath, uploadedBytes, wrangler } from './r2Usage.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = '/downloader/downloads/';

export function referencedVideos(pgnTexts) {
  const keys = new Set();
  for (const text of pgnTexts) {
    for (const [, video] of text.matchAll(/^\[Video "(.*)"\]\s*$/gm)) {
      if (video.startsWith(PREFIX)) keys.add(video.slice(PREFIX.length));
    }
  }
  return [...keys].sort();
}

// Ein einzelner wrangler-Aufruf kann scheitern (Netz kurz weg, Anmeldung gerade abgelaufen: „401 Authentication error“).
// Ein neuer Aufruf erneuert die Anmeldung selbst, deshalb gibt es bis zu drei Versuche mit wachsender Pause.
// Ohne das bricht ein langer Lauf über Nacht beim ersten Aussetzer ab.
export async function withRetry(action, { attempts = 3, pauseMs = 10_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onRetry = () => {} } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await action(attempt);
    } catch (error) {
      if (attempt >= attempts) throw error;
      onRetry(attempt, error);
      await sleep(pauseMs * attempt);
    }
  }
}

const retryNotice = (what) => (attempt) => console.warn(`  ${what} fehlgeschlagen (Versuch ${attempt} von 3) – neuer Versuch gleich ...`);

// Bucket-Größe nach dem Upload. wrangler meldet die Größe mit etwas Verzögerung, deshalb zählt auch
// die eigene Liste der hochgeladenen Dateien – es gilt der größere Wert.
export function projectedBytes({ remoteBytes, state, pending }) {
  return Math.max(remoteBytes, uploadedBytes(state)) + pending.reduce((sum, p) => sum + p.size, 0);
}

async function main() {
  const openings = join(root, 'openings');
  const pgns = readdirSync(openings)
    .filter((f) => f.endsWith('.pgn'))
    .map((f) => readFileSync(join(openings, f), 'utf8'));
  const keys = referencedVideos(pgns);
  const state = loadUploadState();
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

  const usage = await withRetry(() => bucketUsage(), { onRetry: retryNotice('Abfrage der Bucket-Größe') });
  const projected = projectedBytes({ remoteBytes: usage.bytes, state, pending });
  console.log(`Bucket jetzt: ${formatGb(usage.bytes)}, nach dem Upload: ${formatGb(projected)} (ca. ${monthlyCostUsd(projected).toFixed(2)} $ pro Monat)`);

  let uploaded = 0;
  let uploadedNow = 0;
  let uploadMs = 0;
  for (const [i, { key, file, size, stamp }] of pending.entries()) {
    console.log(`[${i + 1}/${pending.length}] ${key} (${(size / 1e6).toFixed(0)} MB)`);
    const objectKey = await videoObjectKey(key);
    // Gemessen wird nur der Versuch, der geklappt hat – Pausen und gescheiterte Versuche würden das Tempo drücken.
    let attemptMs = 0;
    await withRetry(
      () => {
        const started = performance.now();
        wrangler(['r2', 'object', 'put', `${BUCKET}/${objectKey}`, '--file', file, '--content-type', 'video/mp4', '--remote'], { stdio: ['ignore', 'ignore', 'inherit'] });
        attemptMs = performance.now() - started;
      },
      { onRetry: retryNotice('Upload') },
    );
    console.log(`  Hochgeladen: ${describeTransfer(size, attemptMs)}`);
    uploadedNow += size;
    uploadMs += attemptMs;
    state[key] = stamp;
    writeFileSync(statePath, JSON.stringify(state, null, 2));
    uploaded++;
  }

  console.log(`Fertig: ${uploaded} hochgeladen, ${keys.length - uploaded - missing.length} schon vorhanden.`);
  if (uploaded) console.log(`Upload gesamt: ${describeTransfer(uploadedNow, uploadMs)}`);
  if (missing.length) console.warn(`Nicht gefunden (erst mit dem Downloader laden):\n  ${missing.join('\n  ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
