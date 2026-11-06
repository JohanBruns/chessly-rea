// Cloudflare Worker, läuft täglich per Cron: zählt die Videos im R2-Bucket selbst nach (die Statistik im
// Dashboard hinkt hinterher) und schickt über Resend eine E-Mail, sobald der Bucket ALERT_RATIO der
// Upload-Sperre erreicht. Solange er darüber bleibt, kommt jeden Tag eine Erinnerung.
import { ALERT_RATIO, formatGb, FREE_STORAGE_BYTES, monthlyCostUsd, STORAGE_LIMIT_BYTES } from '../scripts/r2Limits.js';

export const ALERT_BYTES = STORAGE_LIMIT_BYTES * ALERT_RATIO;

export async function bucketUsage(bucket) {
  let bytes = 0;
  let objects = 0;
  let cursor;
  do {
    const page = await bucket.list({ cursor, limit: 1000 });
    for (const object of page.objects) {
      bytes += object.size;
      objects++;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { bytes, objects };
}

export function alertMail({ bytes, objects }, { test = false } = {}) {
  const pct = Math.round((bytes / STORAGE_LIMIT_BYTES) * 100);
  const subject = test ? 'Chessly-REA: Test der Speicher-Warnung' : `Chessly-REA: Video-Speicher bei ${pct} % der Grenze`;
  const text = [
    test ? 'Das ist eine Probe-Mail – die Warnung ist richtig eingerichtet.' : 'Der Video-Speicher nähert sich der selbst gesetzten Grenze.',
    '',
    `Belegt: ${formatGb(bytes)} in ${objects} Videos`,
    `Warnung ab: ${formatGb(ALERT_BYTES)}`,
    `Upload-Sperre ab: ${formatGb(STORAGE_LIMIT_BYTES)} (npm run upload-videos lädt dann nichts mehr hoch)`,
    `Kostenlos bei Cloudflare: ${formatGb(FREE_STORAGE_BYTES)}`,
    `Speicherkosten jetzt: ca. ${monthlyCostUsd(bytes).toFixed(2)} $ pro Monat`,
    '',
    test ? '' : 'Bevor du weitere Videos hochlädst, alte Videos aus dem Bucket löschen oder die Sperre in scripts/r2Limits.js anheben.',
  ].join('\n');
  return { subject, text };
}

export async function checkUsage(env, { test = false, fetchImpl = fetch } = {}) {
  const usage = await bucketUsage(env.VIDEOS);
  if (usage.bytes < ALERT_BYTES && !test) return { ...usage, sent: false };
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL) throw new Error('RESEND_API_KEY oder ALERT_EMAIL fehlt');

  const { subject, text } = alertMail(usage, { test });
  // Ohne eigene Domain erlaubt Resend nur den Absender onboarding@resend.dev und nur an die eigene Konto-Adresse
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Chessly-REA <onboarding@resend.dev>', to: [env.ALERT_EMAIL], subject, text }),
  });
  if (!response.ok) throw new Error(`Resend lehnt die Mail ab: ${response.status} ${await response.text()}`);
  return { ...usage, sent: true };
}

export default {
  async scheduled(event, env, ctx) {
    // SEND_TEST_MAIL setzt nur npm run test-alert, kurzzeitig – dann immer eine Probe-Mail
    ctx.waitUntil(checkUsage(env, { test: env.SEND_TEST_MAIL === 'true' }));
  },
};
