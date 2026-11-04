// Läuft nach jedem Build: Kursinhalte dürfen nur in dist/app/ liegen, das der Server nur mit Anmeldung ausliefert.
// Ein falscher Import in src/main.js würde sie sonst unbemerkt öffentlich machen.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEXT_FILE = /\.(js|css|html|json|webmanifest)$/;

// Anfang der Zugfolge jeder PGN-Datei: lang genug, um eindeutig zu sein, und beim Bündeln unverändert.
// Videokurse (Skill-Kurse) haben keine Züge; bei ihnen gilt der erste Videopfad, der ebenfalls nur in der PGN steht.
const markerOf = (pgn) => pgn.match(/^1\. .{30}/m)?.[0] ?? pgn.match(/^\[Video "([^"\\]{20,})"\]/m)?.[1] ?? null;

// Liefert die gefundenen Probleme als Texte; leer heißt: alles in Ordnung
export function checkPrivateBundle({ distDir, openingsDir }) {
  const files = readdirSync(distDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => TEXT_FILE.test(file))
    .map((file) => ({ file, isPrivate: file.split(sep)[0] === 'app', text: readFileSync(join(distDir, file), 'utf8') }));

  const problems = [];
  for (const name of readdirSync(openingsDir).filter((file) => file.endsWith('.pgn'))) {
    const marker = markerOf(readFileSync(join(openingsDir, name), 'utf8'));
    if (!marker) {
      problems.push(`${name}: keine Zugfolge gefunden, die Prüfung kann die Datei nicht erkennen`);
      continue;
    }
    for (const { file } of files.filter((f) => !f.isPrivate && f.text.includes(marker))) {
      problems.push(`${name} steckt in der öffentlichen Datei ${relative(distDir, join(distDir, file))}`);
    }
    if (!files.some((f) => f.isPrivate && f.text.includes(marker))) problems.push(`${name} fehlt im geschützten Teil dist/app/`);
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const problems = checkPrivateBundle({ distDir: join(root, 'dist'), openingsDir: join(root, 'openings') });
  if (problems.length) {
    console.error(`Kursinhalte wären öffentlich abrufbar, Build abgebrochen:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log('Kursinhalte liegen nur im geschützten Teil dist/app/.');
}
