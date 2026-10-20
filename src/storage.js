// Persistenz im localStorage: Lernstand, XP, Pfad-Status, importierte Kurse, Einstellungen.
// Alle Zugriffe sind abgesichert – ohne Storage läuft die App im Speicher weiter.

const KEYS = {
  progress: 'chesslyRea.progress.v1',
  imported: 'chesslyRea.imported.v1',
  settings: 'chesslyRea.settings.v1',
  xp: 'chesslyRea.xp.v1',
  state: 'chesslyRea.state.v1',
};

export const DEFAULT_SETTINGS = {
  name: 'Schachfreund',
  opponentDelay: 450,
  newLinesPerSession: 5,
  showCoordinates: true,
  sound: true,
  hintAfterMistakes: 3,
  boardTheme: 'brown',
  theme: 'dark',
  engineSkill: 5,
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

// ---------- Lernstand der Varianten (Spaced Repetition) ----------
export function loadProgress() {
  return read(KEYS.progress, {});
}

export function saveCard(lineId, card) {
  const progress = loadProgress();
  progress[lineId] = card;
  write(KEYS.progress, progress);
}

// ---------- Pfad-Status (Drill-/Video-Kacheln, zuletzt geöffneter Kurs) ----------
export function loadState() {
  return { drills: {}, videos: {}, lastCourse: null, started: {}, ...read(KEYS.state, {}) };
}

function updateState(fn) {
  const state = loadState();
  fn(state);
  write(KEYS.state, state);
  return state;
}

export function markDrillDone(studyId) {
  updateState((s) => (s.drills[studyId] = Date.now()));
}

export function markVideoWatched(studyId) {
  updateState((s) => (s.videos[studyId] = Date.now()));
}

export function touchCourse(courseId) {
  updateState((s) => {
    s.lastCourse = courseId;
    if (!s.started[courseId]) s.started[courseId] = Date.now();
  });
}

export function resetCourseProgress(courseId) {
  const progress = loadProgress();
  for (const id of Object.keys(progress)) {
    if (id.startsWith(`${courseId}:`)) delete progress[id];
  }
  write(KEYS.progress, progress);
  updateState((s) => {
    const prefix = `${courseId}~`;
    for (const key of Object.keys(s.drills)) if (key.startsWith(prefix)) delete s.drills[key];
    for (const key of Object.keys(s.videos)) if (key.startsWith(prefix)) delete s.videos[key];
    delete s.started[courseId];
    if (s.lastCourse === courseId) s.lastCourse = null;
  });
}

// ---------- XP ----------
export function loadXp() {
  return { total: 0, byDay: {}, ...read(KEYS.xp, {}) };
}

export function dayKey(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addXp(amount, time = Date.now()) {
  if (!amount) return loadXp();
  const xp = loadXp();
  xp.total += amount;
  const key = dayKey(time);
  xp.byDay[key] = (xp.byDay[key] || 0) + amount;
  write(KEYS.xp, xp);
  return xp;
}

// ---------- Importierte Kurse ----------
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

// ---------- Einstellungen ----------
export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
}

export function saveSettings(settings) {
  write(KEYS.settings, settings);
}

// ---------- Sicherung ----------
export function exportBackup() {
  return JSON.stringify(
    {
      app: 'chessly-rea',
      version: 2,
      exportedAt: new Date().toISOString(),
      progress: loadProgress(),
      imported: loadImportedCourses(),
      settings: loadSettings(),
      xp: loadXp(),
      state: loadState(),
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
  if (data.xp) write(KEYS.xp, data.xp);
  if (data.state) write(KEYS.state, data.state);
}
