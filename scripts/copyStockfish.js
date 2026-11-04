// Kopiert die Stockfish-Lite-Engine (JS + WASM) aus node_modules nach public/stockfish/,
// damit Vite sie unverändert ausliefert (der Worker lädt die .wasm-Datei neben sich).
// Mit --strict (beim Build) ist eine fehlende Engine ein Fehler: Sonst ginge ein Build ohne Bot-Engine live,
// und der Service Worker könnte die App nicht vollständig für den Offline-Betrieb speichern.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];

// node_modules wie Node suchen, also auch in übergeordneten Ordnern: Ein Worktree hat oft kein eigenes
export function findStockfishBin(root) {
  for (let dir = resolve(root); ; dir = dirname(dir)) {
    const bin = join(dir, 'node_modules', 'stockfish', 'bin');
    if (existsSync(bin)) return bin;
    if (dirname(dir) === dir) return null;
  }
}

// Liefert den Quellordner oder null, wenn Stockfish nicht installiert ist und nicht strict verlangt wurde
export function copyStockfish(root, { strict = false } = {}) {
  const source = findStockfishBin(root);
  const target = join(root, 'public', 'stockfish');
  if (!source) {
    // Eine frühere Kopie reicht, die Engine wird dann trotzdem ausgeliefert
    if (FILES.every((file) => existsSync(join(target, file)))) return null;
    if (strict) throw new Error('Stockfish fehlt: Der Build hätte keine Bot-Engine. Bitte zuerst „npm install“ ausführen.');
    console.warn('stockfish ist nicht installiert – der Bot spielt dann nur Repertoire-Züge.');
    return null;
  }
  mkdirSync(target, { recursive: true });
  for (const file of FILES) copyFileSync(join(source, file), join(target, file));
  console.log(`Stockfish nach ${target} kopiert.`);
  return source;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    copyStockfish(join(dirname(fileURLToPath(import.meta.url)), '..'), { strict: process.argv.includes('--strict') });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
