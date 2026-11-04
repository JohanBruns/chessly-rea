// Persistenz im localStorage: Lernstand, XP, Pfad-Status, importierte Kurse, Einstellungen.
// Alle Zugriffe sind abgesichert – ohne Storage läuft die App im Speicher weiter.
// Mit Konto liegt alles unter einem eigenen Schlüssel pro Konto, Konten mischen sich auf einem Gerät also nicht.

const KEYS = {
  progress: 'progress',
  imported: 'imported',
  settings: 'settings',
  xp: 'xp',
  state: 'state',
  ui: 'ui',
  sync: 'sync',
};

// Diese Daten folgen dem Konto auf jedes Gerät; ui (eingeklappte Kapitel) und sync bleiben auf dem Gerät.
export const SYNCED_DATA = [KEYS.progress, KEYS.imported, KEYS.settings, KEYS.xp, KEYS.state];
// Stände von vor den Konten: progress, imported, settings, xp, state, ui
const LEGACY_DATA = [...SYNCED_DATA, KEYS.ui];

let activeAccount = null;
let writeListener = null;

const storageKey = (name, account = activeAccount) => (account ? `chesslyRea.user.${account.id}.${name}.v1` : `chesslyRea.${name}.v1`);

// Ab jetzt die Daten dieses Kontos lesen und schreiben (null: Daten ohne Konto, z. B. im Dev-Server)
export function useAccountStorage(account) {
  activeAccount = account;
}

// Wird bei jeder lokalen Änderung an synchronisierten Daten aufgerufen
export function onSyncedWrite(listener) {
  writeListener = listener;
}

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

function readKey(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return key in memory ? memory[key] : fallback;
  }
}

function writeKey(key, value) {
  memory[key] = value;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const read = (name, fallback) => readKey(storageKey(name), fallback);

function write(name, value) {
  const saved = writeKey(storageKey(name), value);
  if (writeListener && SYNCED_DATA.includes(name)) writeListener(name);
  return saved;
}

// ---------- Zugriff für den Abgleich mit dem Server (löst keinen neuen Abgleich aus) ----------
export const readData = (name) => read(name, undefined);
export const writeDataSilently = (name, value) => writeKey(storageKey(name), value);
export const loadSyncMeta = () => ({ versions: {}, dirty: {}, seq: 0, ...read(KEYS.sync, {}) });
export const saveSyncMeta = (meta) => writeKey(storageKey(KEYS.sync), meta);

// ---------- Stände von vor den Konten ----------
export function legacyData() {
  const data = {};
  for (const name of LEGACY_DATA) {
    const value = readKey(storageKey(name, null), undefined);
    if (value !== undefined) data[name] = value;
  }
  return data;
}

export function clearLegacyData() {
  for (const name of LEGACY_DATA) {
    const key = storageKey(name, null);
    delete memory[key];
    try {
      localStorage.removeItem(key);
    } catch {
      // Ohne Storage gibt es nichts zu löschen
    }
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

// ---------- Ansicht (eingeklappte Studies, offene Kapitel) ----------
function loadUi() {
  return { collapsed: {}, openChapters: {}, ...read(KEYS.ui, {}) };
}

export function isCollapsed(studyId) {
  return !!loadUi().collapsed[studyId];
}

export function setCollapsed(studyId, collapsed) {
  const ui = loadUi();
  if (collapsed) ui.collapsed[studyId] = true;
  else delete ui.collapsed[studyId];
  write(KEYS.ui, ui);
}

export function isChapterOpen(chapterId, fallback) {
  const value = loadUi().openChapters[chapterId];
  return value === undefined ? fallback : value;
}

export function setChapterOpen(chapterId, open) {
  const ui = loadUi();
  ui.openChapters[chapterId] = open;
  write(KEYS.ui, ui);
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
  // Topbar (Streak, Level) aktualisieren
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('rea:xp', { detail: { amount, xp } }));
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
  return { ...DEFAULT_SETTINGS, ...(activeAccount ? { name: activeAccount.username } : {}), ...read(KEYS.settings, {}) };
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
