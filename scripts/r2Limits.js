// Grenzen für den R2-Bucket – gemeinsam für die Node-Skripte und den Warn-Worker (ohne Node-Module).
// Der kostenlose Tarif enthält 10 GB Speicher pro Monat; wir bleiben mit 9,5 GB knapp darunter.
export const BUCKET = 'chessly-rea-videos';
export const FREE_STORAGE_BYTES = 10e9;
export const STORAGE_LIMIT_BYTES = 9.5e9;
export const ALERT_RATIO = 0.85;

export const formatGb = (bytes) => `${(bytes / 1e9).toFixed(2)} GB`;
