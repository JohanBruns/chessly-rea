// Baut aus PGN-Text einen Kurs: Kurs → Kapitel (eine PGN-Partie) → Linien
// (jeder Pfad von der Startstellung bis zu einem Blatt des Zugbaums).
import { parsePgn, moveLabel } from './pgnParser.js';

export function hashString(str) {
  // FNV-1a, 32 Bit – stabil und schnell genug für Linien-IDs
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function slugify(text) {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'kurs'
  );
}

function normalizeColor(value) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (['white', 'w', 'weiß', 'weiss'].includes(v)) return 'w';
  if (['black', 'b', 'schwarz'].includes(v)) return 'b';
  return null;
}

function chapterTitle(headers, index, courseName) {
  if (headers.Chapter) return headers.Chapter;
  if (headers.ChapterName) return headers.ChapterName;
  const event = headers.Event;
  if (event && event !== '?') {
    // Lichess exportiert Studien als "Studienname: Kapitelname"
    if (courseName && event.startsWith(`${courseName}: `)) return event.slice(courseName.length + 2);
    return event;
  }
  return `Kapitel ${index + 1}`;
}

function collectLeafPaths(root) {
  const paths = [];
  const walk = (node, path) => {
    if (!node.children.length) {
      if (path.length) paths.push(path);
      return;
    }
    for (const child of node.children) walk(child, [...path, child]);
  };
  walk(root, []);
  return paths;
}

function lineName(path) {
  const titled = [...path].reverse().find((n) => n.title);
  if (titled) return titled.title;
  // Name aus den Abzweigungen ableiten: jeder Zug, der nicht die Hauptfortsetzung ist
  const branches = path.filter((node) => node.parent && node.parent.children[0] !== node);
  if (!branches.length) return 'Hauptvariante';
  return branches.map(moveLabel).join(' · ');
}

// Erkennt die Farbe, die der Lernende spielt: Header > Kursvorgabe > wer den ersten Zug hat.
function detectColor(headers, courseColor, root) {
  return (
    normalizeColor(headers.Orientation) ||
    normalizeColor(headers.PlayerColor) ||
    courseColor ||
    (root.fen.split(' ')[1] === 'b' ? 'b' : 'w')
  );
}

/**
 * @param {object} opts
 * @param {string} opts.pgn      PGN-Text (eine oder mehrere Partien = Kapitel)
 * @param {string} [opts.id]     Kurs-ID (sonst aus dem Namen abgeleitet)
 * @param {string} [opts.name]   Kursname (sonst Header "Course"/"StudyName")
 * @param {string} [opts.color]  'w' | 'b' – überschreibt die Header
 * @param {string} [opts.source] 'builtin' | 'imported'
 */
export function buildCourse({ pgn, id, name, color, source = 'builtin', fileName } = {}) {
  const games = parsePgn(pgn);
  if (!games.length) throw new Error('Die PGN enthält keine Züge.');

  const first = games[0].headers;
  const courseName =
    name || first.Course || first.StudyName || (fileName ? fileName.replace(/\.pgn$/i, '') : 'Unbenannter Kurs');
  const courseId = id || slugify(courseName);
  const courseColor = normalizeColor(color) || normalizeColor(first.CourseColor);

  const lineIds = new Set();
  const chapters = games.map((game, index) => {
    const title = chapterTitle(game.headers, index, first.StudyName || courseName);
    const userColor = normalizeColor(color) || detectColor(game.headers, courseColor, game.root);
    const chapterId = `${courseId}/${index}-${slugify(title)}`;
    const lines = collectLeafPaths(game.root)
      .filter((path) => path.some((node) => node.color === userColor))
      .map((path) => {
        let lineId = `${courseId}:${hashString(game.root.fen + '|' + path.map((n) => n.uci).join(' '))}`;
        // Gleiche Zugfolge in zwei Kapiteln: ID eindeutig halten
        while (lineIds.has(lineId)) lineId += '~';
        lineIds.add(lineId);
        return {
          id: lineId,
          courseId,
          chapterId,
          chapterTitle: title,
          name: lineName(path),
          userColor,
          startFen: game.root.fen,
          intro: game.root.comment,
          moves: path,
        };
      });
    return {
      id: chapterId,
      title,
      description: game.headers.Description || game.root.comment || '',
      userColor,
      root: game.root,
      lines,
    };
  });

  const colors = new Set(chapters.map((c) => c.userColor));
  return {
    id: courseId,
    name: courseName,
    description: first.CourseDescription || '',
    color: colors.size === 1 ? [...colors][0] : 'both',
    source,
    chapters,
    lines: chapters.flatMap((c) => c.lines),
  };
}
