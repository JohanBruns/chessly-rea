// Chessly-Katalog: die Liste aller Kurse aus dem Chessly-Konto, die `npm run catalog`
// nach downloader/catalog.json schreibt. Hier wird nur verglichen, welche Kurse noch fehlen.
const catalogFiles = import.meta.glob('../downloader/catalog.json', { eager: true, import: 'default' });
const EMPTY = { fetchedAt: null, source: null, courses: [], categories: [] };

export function loadChesslyCatalog() {
  const data = catalogFiles['../downloader/catalog.json'];
  if (!data || !Array.isArray(data.courses)) return EMPTY;
  return {
    ...EMPTY,
    ...data,
    courses: data.courses,
    categories: Array.isArray(data.categories) ? data.categories : [],
  };
}

// Kursnamen vergleichen: Groß-/Kleinschreibung, Akzente und Satzzeichen zählen nicht.
export function normalizeCourseName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Welche Chessly-Kurse stecken schon in der App? Über die Kurs-ID aus dem PGN-Header
// [ChesslyCourse "…"] oder – falls der Header fehlt – über den Namen.
export function ownedChesslyIds(courses) {
  const ids = new Set();
  const names = new Set();
  for (const course of courses) {
    if (course.chesslyId) ids.add(course.chesslyId);
    names.add(normalizeCourseName(course.name));
  }
  return { ids, names };
}

export function findOwnedCourse(entry, courses) {
  const name = normalizeCourseName(entry.name);
  return courses.find((course) => course.chesslyId === entry.id || normalizeCourseName(course.name) === name) || null;
}

export function missingChesslyCourses(courses, catalog = loadChesslyCatalog()) {
  const { ids, names } = ownedChesslyIds(courses);
  return catalog.courses.filter((course) => !ids.has(course.id) && !names.has(normalizeCourseName(course.name)));
}

export function catalogCourse(catalog, id) {
  return catalog.courses.find((course) => course.id === id) || null;
}
