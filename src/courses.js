// Kursverwaltung: alle PGN-Dateien aus /openings werden automatisch geladen,
// dazu die im Browser importierten Kurse.
import { buildCourse } from './courseLoader.js';
import { isDue, isMastered, isNew } from './scheduler.js';
import { loadImportedCourses } from './storage.js';

const builtinFiles = import.meta.glob('../openings/*.pgn', { query: '?raw', import: 'default', eager: true });

let cache = null;

export function loadAllCourses({ refresh = false } = {}) {
  if (cache && !refresh) return cache;
  const courses = [];
  const errors = [];

  for (const [path, pgn] of Object.entries(builtinFiles).sort(([a], [b]) => a.localeCompare(b))) {
    const fileName = path.split('/').pop();
    try {
      courses.push(buildCourse({ pgn, fileName, source: 'builtin' }));
    } catch (err) {
      errors.push(`${fileName}: ${err.message}`);
    }
  }
  for (const entry of loadImportedCourses()) {
    try {
      courses.push(buildCourse({ pgn: entry.pgn, id: entry.id, name: entry.name, color: entry.color, source: 'imported' }));
    } catch (err) {
      errors.push(`${entry.name}: ${err.message}`);
    }
  }

  const seen = new Set();
  for (const course of courses) {
    if (seen.has(course.id)) errors.push(`Doppelte Kurs-ID "${course.id}" – bitte einen anderen Kursnamen verwenden.`);
    seen.add(course.id);
  }
  cache = { courses, errors };
  return cache;
}

export function findCourse(id) {
  return loadAllCourses().courses.find((c) => c.id === id) || null;
}

export function findLine(lineId) {
  for (const course of loadAllCourses().courses) {
    const line = course.lines.find((l) => l.id === lineId);
    if (line) return line;
  }
  return null;
}

export function lineStats(lines, progress, now = Date.now()) {
  const stats = { total: lines.length, newCount: 0, due: 0, learned: 0, mastered: 0 };
  for (const line of lines) {
    const card = progress[line.id];
    if (isNew(card)) stats.newCount++;
    else stats.learned++;
    if (isDue(card, now)) stats.due++;
    if (isMastered(card)) stats.mastered++;
  }
  return stats;
}

/**
 * Stellt die Warteschlange einer Trainingseinheit zusammen.
 * @param {object[]} lines  Kandidaten (eines Kurses, Kapitels oder aller Kurse)
 * @param {'learn'|'review'|'practice'} kind
 */
export function buildQueue(lines, kind, progress, { newLinesPerSession = 5, now = Date.now(), practiceSize = 10 } = {}) {
  if (kind === 'learn') {
    return lines
      .filter((l) => isNew(progress[l.id]))
      .slice(0, newLinesPerSession)
      .map((line) => ({ line, mode: 'learn' }));
  }
  if (kind === 'review') {
    return lines
      .filter((l) => isDue(progress[l.id], now))
      .sort((a, b) => progress[a.id].due - progress[b.id].due)
      .map((line) => ({ line, mode: 'drill' }));
  }
  // Freies Üben: zufällige bekannte Linien (oder alle, falls noch nichts gelernt)
  const known = lines.filter((l) => !isNew(progress[l.id]));
  const pool = known.length ? known : lines;
  return shuffle([...pool])
    .slice(0, practiceSize)
    .map((line) => ({ line, mode: 'drill', practice: true }));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
