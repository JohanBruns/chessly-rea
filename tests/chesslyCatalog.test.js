import { describe, expect, it } from 'vitest';
import {
  catalogCourse,
  findOwnedCourse,
  missingChesslyCourses,
  normalizeCourseName,
  ownedChesslyIds,
} from '../src/chesslyCatalog.js';

const CATALOG = {
  fetchedAt: '2026-11-04T21:55:55+00:00',
  courses: [
    { id: 'id-caro', name: 'The Caro-Kann Defense', comingSoon: false, videosDownloaded: true },
    { id: 'id-london', name: 'The London System', comingSoon: false, videosDownloaded: false },
    { id: 'id-center', name: 'The Center Game', comingSoon: true, videosDownloaded: false },
  ],
  categories: [],
};

describe('normalizeCourseName', () => {
  it('ignoriert Groß-/Kleinschreibung, Akzente, Satzzeichen und Umlaute', () => {
    expect(normalizeCourseName('  The Caro-Kann Defense! ')).toBe('the caro kann defense');
    expect(normalizeCourseName('Königsgambit')).toBe('konigsgambit');
    expect(normalizeCourseName('Straße')).toBe('strasse');
  });
});

describe('ownedChesslyIds', () => {
  it('sammelt Kurs-IDs und normalisierte Namen', () => {
    const owned = ownedChesslyIds([
      { chesslyId: 'id-caro', name: 'Caro-Kann' },
      { chesslyId: null, name: 'Eigener Kurs' },
    ]);
    expect([...owned.ids]).toEqual(['id-caro']);
    expect(owned.names.has('eigener kurs')).toBe(true);
  });
});

describe('missingChesslyCourses', () => {
  it('erkennt vorhandene Kurse über die Chessly-ID', () => {
    const missing = missingChesslyCourses([{ chesslyId: 'id-caro', name: 'Ganz anderer Name' }], CATALOG);
    expect(missing.map((course) => course.id)).toEqual(['id-london', 'id-center']);
  });

  it('erkennt vorhandene Kurse über den Namen, wenn die ID fehlt', () => {
    const missing = missingChesslyCourses([{ chesslyId: null, name: 'the london-system' }], CATALOG);
    expect(missing.map((course) => course.id)).toEqual(['id-caro', 'id-center']);
  });

  it('liefert alle Kurse, wenn die App noch keinen davon hat', () => {
    expect(missingChesslyCourses([], CATALOG)).toHaveLength(3);
  });

  it('liefert nichts, wenn alle Kurse vorhanden sind', () => {
    const owned = CATALOG.courses.map((course) => ({ chesslyId: course.id, name: course.name }));
    expect(missingChesslyCourses(owned, CATALOG)).toEqual([]);
  });
});

describe('findOwnedCourse / catalogCourse', () => {
  const courses = [{ chesslyId: 'id-london', name: 'London' }];

  it('findet einen Kurs über die ID oder den Namen', () => {
    expect(findOwnedCourse({ id: 'id-london', name: 'Unbekannt' }, courses)).toBe(courses[0]);
    expect(findOwnedCourse({ id: 'id-x', name: 'London' }, courses)).toBe(courses[0]);
    expect(findOwnedCourse({ id: 'id-x', name: 'Nichts' }, courses)).toBeNull();
  });

  it('liest einen Katalogeintrag über die ID', () => {
    expect(catalogCourse(CATALOG, 'id-center')?.name).toBe('The Center Game');
    expect(catalogCourse(CATALOG, 'id-unbekannt')).toBeNull();
  });
});
