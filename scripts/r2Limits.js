// Grenzen für den R2-Bucket – gemeinsam für die Node-Skripte und den Warn-Worker (ohne Node-Module).
// Der kostenlose Tarif enthält 10 GB Speicher pro Monat; darüber kostet R2 Standard 0,015 $ pro GB und Monat.
// Die Upload-Sperre bei 25 GB ist die selbst gewählte Kostengrenze (dort rund 0,23 $ pro Monat).
export const BUCKET = 'chessly-rea-videos';
export const FREE_STORAGE_BYTES = 10e9;
export const PRICE_PER_GB_MONTH = 0.015; // US-Dollar
export const STORAGE_LIMIT_BYTES = 25e9;
export const ALERT_RATIO = 0.85;

export const formatGb = (bytes) => `${(bytes / 1e9).toFixed(2)} GB`;

// Speicherkosten pro Monat in US-Dollar: Cloudflare rundet auf volle GB auf und zieht die freien 10 GB ab.
// Uploads und Lesezugriffe bleiben in dieser App im Freikontingent, Download-Traffic ist bei R2 gratis.
export const monthlyCostUsd = (bytes) => Math.max(0, Math.ceil(bytes / 1e9) - FREE_STORAGE_BYTES / 1e9) * PRICE_PER_GB_MONTH;
