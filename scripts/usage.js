// Zeigt, wie viel vom kostenlosen Cloudflare-Kontingent belegt ist.  Aufruf: npm run usage
import { BUCKET, bucketUsage, formatGb, FREE_STORAGE_BYTES, STORAGE_LIMIT_BYTES } from './r2Usage.js';

const { bytes, objects } = bucketUsage();
const pct = (value, total) => `${((value / total) * 100).toFixed(0)} %`;

console.log(`R2-Bucket ${BUCKET}: ${objects} Videos, ${formatGb(bytes)}`);
console.log(`  kostenlos: ${formatGb(FREE_STORAGE_BYTES)} (${pct(bytes, FREE_STORAGE_BYTES)} belegt)`);
console.log(`  Upload-Sperre ab: ${formatGb(STORAGE_LIMIT_BYTES)} (${pct(bytes, STORAGE_LIMIT_BYTES)} erreicht)`);
console.log(bytes <= STORAGE_LIMIT_BYTES ? 'Alles im kostenlosen Bereich.' : 'WARNUNG: über der Upload-Sperre – Videos löschen, bevor die 10 GB erreicht sind!');
console.log('');
console.log('Abrufe kosten nichts extra: Videos sind nur über die Pages-Funktion erreichbar, und die ist im');
console.log('Gratis-Tarif auf 100.000 Aufrufe pro Tag begrenzt (danach Fehler statt Rechnung). Das sind höchstens');
console.log('rund 3 Millionen Lesezugriffe im Monat – frei sind 10 Millionen.');
