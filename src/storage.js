// Persistenz im localStorage: Lernstand, importierte Kurse, Einstellungen.
// Alle Zugriffe sind abgesichert – ohne Storage läuft die App im Speicher weiter.

const KEYS = {
  progress: 'chesslyRea.progress.v1',
  imported: 'chesslyRea.imported.v1',
  settings: 'chesslyRea.settings.v1',
};

export const DEFAULT_SETTINGS = {
  opponentDelay: 450,
  newLinesPerSession: 5,
  showCoordinates: true,
  sound: true,
  hintAfterMistakes: 2,
};

const memory = {};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return key in memory ? memory[key] : fallback;
  }
}

function write(key, value) {
  memory[key] = value;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadProgress() {
  return read(KEYS.progress, {});
}

export function saveCard(lineId, card) {
  const progress = loadProgress();
  progress[lineId] = card;
  write(KEYS.progress, progress);
}

export function resetCourseProgress(courseId) {
  const progress = loadProgress();
  for (const id of Object.keys(progress)) {
    if (id.startsWith(`${courseId}:`)) delete progress[id];
  }
  write(KEYS.progress, progress);
}

export function loadImportedCourses() {
  return read(KEYS.imported, []);
}

export function saveImportedCourse(entry) {
  const list = loadImportedCourses().filter((c) => c.id !== entry.id);
  list.push(entry);
  return write(KEYS.imported, list);
}

export function removeImportedCourse(id) {
  write(
    KEYS.imported,
    loadImportedCourses().filter((c) => c.id !== id),
  );
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
}

export function saveSettings(settings) {
  write(KEYS.settings, settings);
}

export function exportBackup() {
  return JSON.stringify(
    {
      app: 'chessly-rea',
      version: 1,
      exportedAt: new Date().toISOString(),
      progress: loadProgress(),
      imported: loadImportedCourses(),
      settings: loadSettings(),
    },
    null,
    2,
  );
}

export function importBackup(json) {
  const data = JSON.parse(json);
  if (data.app !== 'chessly-rea') throw new Error('Das ist keine Chessly-REA-Sicherung.');
  if (data.progress) write(KEYS.progress, data.progress);
  if (data.imported) write(KEYS.imported, data.imported);
  if (data.settings) write(KEYS.settings, data.settings);
}
