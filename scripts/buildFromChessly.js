// Baut die Studies einer PGN-Datei aus den Chessly-Linien in downloader/lines/ neu auf.
// Kopfzeilen (Kurs, Kapitel, deutsche Titel, Video, Orientierung) bleiben aus der alten PGN,
// Züge, Kommentare und Pfeile kommen von Chessly. Liegt downloader/lines/<Kurs>.de.json vor,
// werden Kommentare auf Deutsch übernommen: englischer Text → deutscher Text, dazu
// "intro:<Study-ID>" → eigene Einführung der Study.
// Aufruf: npm run neuaufbau -- openings/caroKann.pgn
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePgn } from '../src/pgnParser.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const linesDir = join(root, 'downloader', 'lines');
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Gleicher Schlüssel wie im Abgleich: Brett, Zugrecht, Rochade
export function positionKey(fen) {
  return fen.split(' ').slice(0, 3).join(' ');
}

// Zugbaum aus den Varianten; Kinder in der Reihenfolge ihres ersten Auftretens,
// damit die Varianten in der App in derselben Reihenfolge wie bei Chessly kommen.
export function buildTree(variations) {
  const tree = { children: [] };
  for (const variation of variations) {
    let node = tree;
    for (const move of variation.moves) {
      const key = positionKey(move.nextFen);
      let child = node.children.find((c) => c.key === key);
      if (!child) {
        child = { key, san: move.san, fen: move.fen, children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }
  return tree;
}

function shapes(comment) {
  const arrows = [];
  const squares = [];
  for (const [kind, brush] of [['opportunities', 'G'], ['threats', 'R']]) {
    for (const arrow of comment.arrows?.[kind] ?? []) arrows.push(brush + arrow.replace('-', ''));
    for (const square of comment.highlights?.[kind] ?? []) squares.push(brush + square);
  }
  return [arrows.length ? `[%cal ${arrows.join(',')}]` : '', squares.length ? `[%csl ${squares.join(',')}]` : '']
    .filter(Boolean)
    .join(' ');
}

export function normalizeText(text) {
  return (text ?? '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

// PGN-Kommentar aus Chessly-Kommentar, übersetzt, falls vorhanden
function commentText(entry, translations) {
  if (!entry) return '';
  const english = normalizeText(entry.text);
  const text = english ? normalizeText(translations[english] ?? english) : '';
  return [text, shapes(entry)].filter(Boolean).join(' ');
}

export function writeMoves(tree, commentFor) {
  const out = [];
  const label = (node, forceNumber) => {
    const [, turn, , , , number] = node.fen.split(' ');
    if (turn === 'w') return `${number}. ${node.san}`;
    return forceNumber ? `${number}... ${node.san}` : node.san;
  };
  const writeMove = (node, forceNumber) => {
    out.push(label(node, forceNumber));
    const comment = commentFor(node.key);
    if (comment) out.push(`{${comment}}`);
    return Boolean(comment);
  };
  const writeChildren = (parent, forceNumber) => {
    if (!parent.children.length) return;
    const [main, ...alternatives] = parent.children;
    const commented = writeMove(main, forceNumber);
    for (const alt of alternatives) {
      out.push('(');
      writeMove(alt, true);
      writeChildren(alt, true);
      out.push(')');
    }
    writeChildren(main, commented || alternatives.length > 0);
  };
  writeChildren(tree, true);
  return out.join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');
}

function headerLines(headers) {
  return Object.entries(headers).map(
    ([key, value]) =>
      `[${key} "${String(value).replace(/\s+/g, ' ').replace(/\\/g, '').replace(/"/g, "'")}"]`,
  );
}

export function slugify(text) {
  return (
    String(text)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'kurs'
  );
}

/**
 * Baut eine PGN für einen Kurs, für den es noch keine Vorlage gibt.
 * Kapitel, Studies, Videos und Farbe kommen aus downloader/lines/<Kurs>.json.
 */
export function buildNewPgn(chessly, { translations = {} } = {}) {
  const color = chessly.color === 'b' ? 'black' : 'white';
  const games = [];
  let firstGame = true;

  for (const chapter of chessly.chapters) {
    let firstOfChapter = true;
    for (const study of chapter.studies) {
      const comments = new Map(
        Object.entries(study.comments ?? {}).map(([fen, list]) => [positionKey(fen), list[0]]),
      );
      const commentFor = (key) => commentText(comments.get(key), translations);
      const variations = study.variations ?? [];
      const startFen = variations[0]?.startFen ?? START_FEN;
      const intro =
        normalizeText(translations[`intro:${study.id}`]) || commentFor(positionKey(startFen));

      const headers = {};
      if (firstGame) {
        headers.Course = chessly.name;
        headers.ChesslyCourse = chessly.id;
        headers.CourseColor = color;
        if (chessly.description) headers.CourseDescription = chessly.description;
      }
      headers.Chapter = chapter.name;
      if (firstOfChapter && chapter.description) headers.ChapterDescription = chapter.description;
      headers.Study = study.name;
      if (study.videos?.length) headers.Video = study.videos[0];
      headers.Orientation = color;
      if (startFen !== START_FEN) {
        headers.FEN = startFen;
        headers.SetUp = '1';
      }

      const lines = [...headerLines(headers), ''];
      if (intro) lines.push(`{${intro}}`);
      const moves = writeMoves(buildTree(variations), commentFor);
      lines.push(moves ? `${moves} *` : '*');
      games.push(lines.join('\n'));
      firstGame = false;
      firstOfChapter = false;
    }
  }

  return games.join('\n\n').concat('\n');
}

// Sucht eine vorhandene PGN über den ChesslyCourse-Header – unabhängig vom Dateinamen.
export function findExistingPgn(courseId) {
  if (!courseId) return null;
  const openingsDir = join(root, 'openings');
  if (!existsSync(openingsDir)) return null;
  for (const file of readdirSync(openingsDir).filter((f) => f.endsWith('.pgn'))) {
    const text = readFileSync(join(openingsDir, file), 'utf8');
    const match = text.match(/^\[ChesslyCourse "([^"]+)"\]/m);
    if (match && match[1] === courseId) return join(openingsDir, file);
  }
  return null;
}

export function buildPgn(oldPgn, chessly, translations = {}) {
  const games = parsePgn(oldPgn);
  const studies = chessly.chapters.flatMap((c) => c.studies);
  if (games.length !== studies.length) {
    throw new Error(`Die PGN hat ${games.length} Studies, Chessly ${studies.length} – bitte zuerst npm run abgleich ansehen.`);
  }
  return games
    .map((game, i) => {
      const study = studies[i];
      const comments = new Map(Object.entries(study.comments).map(([fen, list]) => [positionKey(fen), list[0]]));
      const commentFor = (key) => commentText(comments.get(key), translations);
      const startKey = positionKey(study.variations[0]?.startFen ?? START_FEN);
      // Intro: eigene Einführung, sonst Chessly-Kommentar der Startstellung, sonst der bisherige Text
      const intro = normalizeText(translations[`intro:${study.id}`]) || commentFor(startKey) || game.root.comment;
      const headers = { ...game.headers };
      delete headers.Result;
      const lines = [...headerLines(headers), ''];
      if (intro) lines.push(`{${intro}}`);
      lines.push(`${writeMoves(buildTree(study.variations), commentFor)} *`);
      return lines.join('\n');
    })
    .join('\n\n')
    .concat('\n');
}

function main() {
  const args = process.argv.slice(2);

  // Neuer Kurs: PGN direkt aus downloader/lines/<Kurs>.json bauen.
  if (args[0] === '--new') {
    const input = args[1];
    if (!input) {
      console.log('Aufruf: node scripts/buildFromChessly.js --new downloader/lines/<Kurs>.json [--force]');
      process.exit(1);
    }
    const jsonPath = resolve(input);
    const chessly = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const existing = findExistingPgn(chessly.id);
    const target = existing || join(root, 'openings', slugify(chessly.name) + '.pgn');
    if (existsSync(target) && !args.includes('--force')) {
      console.log(`PGN existiert schon: ${target}`);
      console.log('Nichts überschrieben. Für ein Update: npm run neuaufbau -- openings/<datei>.pgn');
      return;
    }
    const dePath = jsonPath.replace(/\.json$/, '.de.json');
    const translations = existsSync(dePath) ? JSON.parse(readFileSync(dePath, 'utf8')) : {};
    mkdirSync(join(root, 'openings'), { recursive: true });
    writeFileSync(target, buildNewPgn(chessly, { translations }));
    const studies = chessly.chapters.reduce((sum, chapter) => sum + chapter.studies.length, 0);
    console.log(`PGN gespeichert: ${target} (${chessly.chapters.length} Kapitel, ${studies} Studies)`);
    if (chessly.color !== 'w' && chessly.color !== 'b') {
      console.log('Hinweis: Farbe unbekannt – "Orientation" steht auf white. Bitte ggf. in der PGN anpassen.');
    }
    return;
  }

  const file = args[0];
  if (!file) {
    console.log('Aufruf: npm run neuaufbau -- openings/<datei>.pgn');
    console.log('   oder: node scripts/buildFromChessly.js --new downloader/lines/<Kurs>.json');
    process.exit(1);
  }
  const path = resolve(file);
  const oldPgn = readFileSync(path, 'utf8');
  const chesslyId = parsePgn(oldPgn)[0]?.headers.ChesslyCourse;
  const jsonFile = readdirSync(linesDir)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.de.json'))
    .find((f) => JSON.parse(readFileSync(join(linesDir, f), 'utf8')).id === chesslyId);
  if (!jsonFile) throw new Error(`Keine Chessly-Linien für ${chesslyId} in ${linesDir}`);
  const chessly = JSON.parse(readFileSync(join(linesDir, jsonFile), 'utf8'));
  const deFile = join(linesDir, jsonFile.replace(/\.json$/, '.de.json'));
  const translations = existsSync(deFile) ? JSON.parse(readFileSync(deFile, 'utf8')) : {};
  writeFileSync(path, buildPgn(oldPgn, chessly, translations));
  console.log(`${file} neu aufgebaut aus ${jsonFile} (${Object.keys(translations).length} deutsche Kommentare)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
