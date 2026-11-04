// Startet downloader/catalog.py mit der Python-Umgebung des Downloaders.
// Ergebnis: downloader/catalog.json – die Grundlage für die Seite „Chessly-Kurse“.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const candidates = [
  join(root, 'downloader', '.venv', 'Scripts', 'python.exe'),
  join(root, 'downloader', '.venv', 'bin', 'python'),
  'python',
];
const python = candidates.find((candidate) => candidate === 'python' || existsSync(candidate));
const result = spawnSync(python, [join(root, 'downloader', 'catalog.py')], { stdio: 'inherit', cwd: root });

if (result.error) {
  console.error(`Python nicht gefunden: ${result.error.message}`);
  console.error('Bitte zuerst downloader\\setup.bat ausführen.');
  process.exit(1);
}
process.exit(result.status ?? 1);
