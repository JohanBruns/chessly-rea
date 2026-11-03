// Abgleich der eigenen PGN-Kurse mit den Chessly-Linien aus downloader/lines/.
// Zuordnung über den PGN-Header [ChesslyCourse "<Kurs-ID>"] in der ersten Partie.
// Aufruf: npm run abgleich  →  schreibt downloader/lines/<Kurs> - Abgleich.md
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCourse } from '../src/courseLoader.js';
import { chesslyMoveLabel, compareCourse } from '../src/courseCompare.js';
import { moveLabel, parsePgn } from '../src/pgnParser.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const openingsDir = join(root, 'openings');
const linesDir = join(root, 'downloader', 'lines');

// "5.f4 cxd4 6.cxd4 h5" – ab einem Zug, höchstens `count` Halbzüge
function continuation(moves, from, count = 8) {
  return moves
    .slice(from, from + count)
    .map((m, i) => (i === 0 || m.fen.split(' ')[1] === 'w' ? chesslyMoveLabel(m) : m.san))
    .join(' ') + (moves.length > from + count ? ' …' : '');
}

function describeVariation(v) {
  const label = `Variante ${v.index}`;
  if (v.status === 'ok') return `- ✓ ${label}`;
  const from = chesslyMoveLabel(v.missing);
  const rest = `Chessly: ${continuation(v.moves, v.depth)}`;
  const yours = v.yourMoves.join(', ');
  let text;
  if (v.status === 'kürzer') text = `deine Linie endet vor ${from} (${v.depth}/${v.total} Halbzüge). ${rest}`;
  else if (v.status === 'eigenerZug') text = `anderer eigener Zug: Chessly ${from}, du spielst ${yours}. ${rest}`;
  else text = `Gegnerzug ${from} fehlt (du hast hier nur ${yours}). ${rest}`;
  if (v.elsewhere) text += ` · steht weiter in „${v.elsewhere.study.title}“ (${v.elsewhere.depth}/${v.total})`;
  return `- ✗ ${label}: ${text}`;
}

function formatReport(course, chessly, result) {
  const { summary } = result;
  const out = [
    `# Abgleich: ${course.name} ↔ ${chessly.name}`,
    '',
    `Kapitel ${summary.chapters.own}/${summary.chapters.chessly} · Studies ${summary.studies.own}/${summary.studies.chessly} · ` +
      `Chessly-Varianten vollständig bei dir: **${summary.complete} von ${summary.variations}**`,
    '',
    `Von den übrigen: ${summary.byStatus.eigenerZug} mit anderem eigenen Zug · ` +
      `${summary.byStatus.gegnerZug} mit fehlendem Gegnerzug · ${summary.byStatus.kürzer} hören bei dir früher auf`,
    '',
    'Legende: ✓ vollständig enthalten · ✗ fehlt ab dem genannten Zug · „Nur bei dir“ = eigene Linien, die Chessly so nicht hat.',
  ];
  result.chapters.forEach((chapter, ci) => {
    out.push('', `## ${ci + 1}. ${chapter.own?.title ?? '(fehlt bei dir)'} ↔ ${chapter.chessly.name}`);
    chapter.studies.forEach((study, si) => {
      const ok = study.variations.filter((v) => v.status === 'ok').length;
      const title = study.own?.title ?? '(fehlt bei dir)';
      out.push('', `### ${ci + 1}.${si + 1} ${title} ↔ ${study.chessly.name} — ${ok}/${study.chessly.variations.length} vollständig`);
      if (!study.own) return;
      if (study.chessly.hasVideo !== Boolean(study.own.video)) {
        out.push(`- Video: bei Chessly ${study.chessly.hasVideo ? 'ja' : 'nein'}, bei dir ${study.own.video ? 'ja' : 'nein'}`);
      }
      out.push(...study.variations.map(describeVariation));
      for (const { line, depth } of study.extraLines) {
        out.push(`- Nur bei dir: „${line.name}“ ab ${moveLabel(line.moves[depth])}`);
      }
    });
    for (const extra of chapter.extraStudies) out.push('', `### Zusätzliche Study bei dir: ${extra.title}`);
  });
  for (const extra of result.extraChapters) out.push('', `## Zusätzliches Kapitel bei dir: ${extra.title}`);
  return out.join('\n') + '\n';
}

function loadChesslyCourses() {
  return readdirSync(linesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(linesDir, f), 'utf8')));
}

function main() {
  const chesslyCourses = loadChesslyCourses();
  for (const file of readdirSync(openingsDir).filter((f) => f.endsWith('.pgn'))) {
    const pgn = readFileSync(join(openingsDir, file), 'utf8');
    const chesslyId = parsePgn(pgn)[0]?.headers.ChesslyCourse;
    if (!chesslyId) continue;
    const chessly = chesslyCourses.find((c) => c.id === chesslyId);
    if (!chessly) {
      console.log(`${file}: keine Chessly-Linien für ${chesslyId} – zuerst downloader/lines.py ausführen.`);
      continue;
    }
    const course = buildCourse({ pgn, fileName: file });
    const result = compareCourse(course, chessly);
    const target = join(linesDir, `${chessly.name} - Abgleich.md`);
    writeFileSync(target, formatReport(course, chessly, result));
    const { summary } = result;
    console.log(
      `${file}: Studies ${summary.studies.own}/${summary.studies.chessly}, ` +
        `${summary.complete} von ${summary.variations} Chessly-Varianten vollständig → ${target}`,
    );
  }
}

main();
