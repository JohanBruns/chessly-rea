// Zeigt, wie viel vom kostenlosen Cloudflare-Kontingent belegt ist und was darüber kostet.  Aufruf: npm run usage
import { ALERT_RATIO, BUCKET, bucketUsage, formatGb, FREE_STORAGE_BYTES, loadUploadState, monthlyCostUsd, PRICE_PER_GB_MONTH, STORAGE_LIMIT_BYTES, uploadedBytes } from './r2Usage.js';

// Die Cloudflare-Statistik hinkt nach einem Upload hinterher – es gilt der größere Wert
const reported = bucketUsage();
const state = loadUploadState();
const bytes = Math.max(reported.bytes, uploadedBytes(state));
const objects = Math.max(reported.objects, Object.keys(state).length);
const pct = (value, total) => `${((value / total) * 100).toFixed(0)} %`;

console.log(`R2-Bucket ${BUCKET}: ${objects} Videos, ${formatGb(bytes)}`);
if (reported.bytes < bytes) console.log(`  (Cloudflare-Statistik zeigt noch ${formatGb(reported.bytes)}, sie aktualisiert sich verzögert)`);
console.log(`  kostenlos: ${formatGb(FREE_STORAGE_BYTES)} (${pct(bytes, FREE_STORAGE_BYTES)} belegt)`);
console.log(`  Upload-Sperre ab: ${formatGb(STORAGE_LIMIT_BYTES)} (${pct(bytes, STORAGE_LIMIT_BYTES)} erreicht)`);
console.log(`  E-Mail-Warnung ab: ${formatGb(STORAGE_LIMIT_BYTES * ALERT_RATIO)} (${(ALERT_RATIO * 100).toFixed(0)} % der Sperre)`);
if (bytes > STORAGE_LIMIT_BYTES) {
  console.log('WARNUNG: über der Upload-Sperre – Videos löschen oder die Sperre in scripts/r2Limits.js anheben.');
} else if (bytes > FREE_STORAGE_BYTES) {
  console.log(`Über dem kostenlosen Kontingent: ca. ${monthlyCostUsd(bytes).toFixed(2)} $ pro Monat (${PRICE_PER_GB_MONTH} $ pro GB über ${formatGb(FREE_STORAGE_BYTES)}).`);
} else {
  console.log('Alles im kostenlosen Bereich.');
}
console.log('');
console.log('Abrufe kosten nichts extra: Videos sind nur über die Pages-Funktion erreichbar, und die ist im');
console.log('Gratis-Tarif auf 100.000 Aufrufe pro Tag begrenzt (danach Fehler statt Rechnung). Das sind höchstens');
console.log('rund 3 Millionen Lesezugriffe im Monat – frei sind 10 Millionen.');
