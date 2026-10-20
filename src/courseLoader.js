// Baut aus PGN-Text einen Kurs im Chessly-Aufbau:
// Kurs → Kapitel → Study (eine PGN-Partie) → Varianten (jeder Pfad bis zu einem Blatt)
// Jede Study bekommt einen Lernpfad aus Kacheln (Video, Lern-Kacheln, Drill-Kachel).
import { parsePgn, moveLabel } from './pgnParser.js';

export const VARIATIONS_PER_TILE = 2;

export function hashString(str) {
  // FNV-1a, 32 Bit – stabil und schnell genug für IDs
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

function studyTitle(headers, index, courseName) {
  if (headers.Study) return headers.Study;
  if (headers.ChapterName) return headers.ChapterName;
  const event = headers.Event;
  if (event && event !== '?') {
    // Lichess exportiert Studien als "Studienname: Kapitelname"
    if (courseName && event.startsWith(`${courseName}: `)) return event.slice(courseName.length + 2);
    return event;
  }
  return `Study ${index + 1}`;
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

// Farbe des Lernenden: Header > Kursvorgabe > wer den ersten Zug hat
function detectColor(headers, courseColor, root) {
  return (
    normalizeColor(headers.Orientation) ||
    normalizeColor(headers.PlayerColor) ||
    courseColor ||
    (root.fen.split(' ')[1] === 'b' ? 'b' : 'w')
  );
}

function buildTiles(study) {
  const tiles = [];
  if (study.video) tiles.push({ id: `${study.id}:video`, type: 'video', studyId: study.id, lines: [] });
  for (let i = 0; i < study.lines.length; i += VARIATIONS_PER_TILE) {
    tiles.push({
      id: `${study.id}:t${i / VARIATIONS_PER_TILE}`,
      type: 'learn',
      studyId: study.id,
      firstVariation: i + 1,
      lines: study.lines.slice(i, i + VARIATIONS_PER_TILE),
    });
  }
  if (study.lines.length) tiles.push({ id: `${study.id}:drill`, type: 'drill', studyId: study.id, lines: study.lines });
  return tiles;
}

/**
 * @param {object} opts
 * @param {string} opts.pgn      PGN-Text (jede Partie = eine Study)
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

  const chapters = [];
  const chapterByTitle = new Map();
  const lineIds = new Set();

  games.forEach((game, gameIndex) => {
    const h = game.headers;
    const chapterName = h.Chapter || (h.Study ? 'Kapitel 1' : null) || courseName;
    let chapter = chapterByTitle.get(chapterName);
    if (!chapter) {
      chapter = {
        id: `${courseId}~c${chapters.length}`,
        index: chapters.length,
        title: chapterName,
        description: h.ChapterDescription || '',
        studies: [],
      };
      chapters.push(chapter);
      chapterByTitle.set(chapterName, chapter);
    }

    const userColor = normalizeColor(color) || detectColor(h, courseColor, game.root);
    const study = {
      id: `${chapter.id}s${chapter.studies.length}`,
      index: chapter.studies.length,
      chapterId: chapter.id,
      courseId,
      title: studyTitle(h, gameIndex, first.StudyName || courseName),
      description: h.Description || game.root.comment || '',
      video: h.Video || null,
      userColor,
      root: game.root,
      lines: [],
    };

    study.lines = collectLeafPaths(game.root)
      .filter((path) => path.some((node) => node.color === userColor))
      .map((path, i) => {
        let lineId = `${courseId}:${hashString(game.root.fen + '|' + path.map((n) => n.uci).join(' '))}`;
        // Gleiche Zugfolge in zwei Studies: ID eindeutig halten
        while (lineIds.has(lineId)) lineId += '~';
        lineIds.add(lineId);
        return {
          id: lineId,
          courseId,
          chapterId: chapter.id,
          studyId: study.id,
          chapterTitle: chapter.title,
          studyTitle: study.title,
          variation: i + 1,
          name: lineName(path),
          userColor,
          startFen: game.root.fen,
          intro: game.root.comment,
          moves: path,
        };
      });
    study.tiles = buildTiles(study);
    chapter.studies.push(study);
  });

  for (const chapter of chapters) {
    chapter.lines = chapter.studies.flatMap((s) => s.lines);
    const colors = new Set(chapter.studies.map((s) => s.userColor));
    chapter.userColor = colors.size === 1 ? [...colors][0] : 'both';
  }
  const studies = chapters.flatMap((c) => c.studies);
  const colors = new Set(studies.map((s) => s.userColor));
  return {
    id: courseId,
    name: courseName,
    description: first.CourseDescription || '',
    icon: first.CourseIcon || null,
    hue: Number.isFinite(Number(first.CourseHue)) && first.CourseHue ? Number(first.CourseHue) : Number.parseInt(hashString(courseName), 36) % 360,
    color: colors.size === 1 ? [...colors][0] : 'both',
    source,
    chapters,
    studies,
    tiles: studies.flatMap((s) => s.tiles),
    lines: studies.flatMap((s) => s.lines),
  };
}

// Stellungsschlüssel ohne Zugzähler – für Course Explorer und Zugumstellungen
export function positionKey(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

// Index: Stellung → Repertoire-Knoten (über alle Studies eines Kurses)
export function buildPositionIndex(course) {
  const index = new Map();
  const add = (fen, entry) => {
    const key = positionKey(fen);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(entry);
  };
  for (const study of course.studies) {
    const walk = (node) => {
      add(node.fen, { study, node });
      node.children.forEach(walk);
    };
    walk(study.root);
  }
  return index;
}
