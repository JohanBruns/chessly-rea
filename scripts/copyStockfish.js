// Kopiert die Stockfish-Lite-Engine (JS + WASM) aus node_modules nach public/stockfish/,
// damit Vite sie unverändert ausliefert (der Worker lädt die .wasm-Datei neben sich).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'stockfish', 'bin');
const target = join(root, 'public', 'stockfish');
const files = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];

if (!existsSync(source)) {
  console.warn('stockfish ist nicht installiert – der Bot spielt dann nur Repertoire-Züge.');
  process.exit(0);
}
mkdirSync(target, { recursive: true });
for (const file of files) copyFileSync(join(source, file), join(target, file));
console.log(`Stockfish nach ${target} kopiert.`);
