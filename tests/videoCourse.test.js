// Reine Video-Kurse (Skill-Kurse): Partien ohne Züge, nur mit [Video], bilden Studies aus einer Video-Kachel.
import { describe, expect, it } from 'vitest';
import { buildCourse } from '../src/courseLoader.js';
import { parsePgn } from '../src/pgnParser.js';
import { countsTile, courseProgress, courseStarted, nextTile } from '../src/progress.js';
import { tileHref } from '../src/ui/studyBlock.js';
import { tileLayout } from '../src/ui/tilePath.js';
import { filterCourses } from '../src/views/coursesView.js';
import { currentCourse } from '../src/views/homeView.js';

const VIDEO_PGN = `[Course "Taktik Basics"]
[ChesslyCourse "11111111-2222-3333-4444-555555555555"]
[Chapter "Gabeln"]
[Study "Doppelangriffe"]
[Video "/downloader/downloads/Taktik Basics/01-01 Gabeln - Doppelangriffe.mp4"]
[Orientation "white"]

*

[Chapter "Gabeln"]
[Study "Fesselungen"]
[Video "/downloader/downloads/Taktik Basics/01-02 Gabeln - Fesselungen.mp4"]
[Orientation "white"]

*

[Chapter "Matt"]
[Study "Matt in einem Zug"]
[Video "/downloader/downloads/Taktik Basics/02-01 Matt - Matt in einem Zug.mp4"]
[Orientation "white"]

*
`;

const LINES_PGN = `[Course "Londoner"]
[Chapter "Aufbau"]
[Study "Grundstellung"]
[Video "https://example.com/video"]
[Orientation "white"]

1. d4 d5 2. Bf4 *`;

const videoCourse = buildCourse({ pgn: VIDEO_PGN });
const linesCourse = buildCourse({ pgn: LINES_PGN });
const state = (extra = {}) => ({ drills: {}, videos: {}, lastCourse: null, started: {}, ...extra });

describe('parsePgn mit Video-Partien ohne Züge', () => {
  it('behält Partien ohne Züge, wenn sie ein Video haben', () => {
    expect(parsePgn(VIDEO_PGN)).toHaveLength(3);
  });

  it('wirft Partien ohne Züge und ohne Video weiter weg', () => {
    expect(parsePgn(`${VIDEO_PGN}\n[Chapter "Leer"]\n[Study "Nichts"]\n\n*\n`)).toHaveLength(3);
  });
});

describe('buildCourse für einen reinen Video-Kurs', () => {
  it('erkennt den Video-Kurs und gibt ihm keine Farbe', () => {
    expect(videoCourse.videoOnly).toBe(true);
    expect(videoCourse.color).toBe('video');
    expect(videoCourse.chesslyId).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('macht aus jedem Video eine Study mit genau einer Video-Kachel', () => {
    expect(videoCourse.chapters.map((c) => [c.title, c.studies.length])).toEqual([
      ['Gabeln', 2],
      ['Matt', 1],
    ]);
    expect(videoCourse.lines).toEqual([]);
    for (const study of videoCourse.studies) {
      expect(study.lines).toEqual([]);
      expect(study.tiles.map((t) => t.type)).toEqual(['video']);
    }
  });

  it('hält einen Kurs mit Zügen für einen normalen Kurs', () => {
    expect(linesCourse.videoOnly).toBe(false);
    expect(linesCourse.color).toBe('w');
  });
});

describe('Fortschritt im Video-Kurs', () => {
  const [first, second, third] = videoCourse.studies;

  it('zählt Videos als Kacheln, in normalen Kursen nicht', () => {
    const video = { type: 'video' };
    expect(countsTile(videoCourse, video)).toBe(true);
    expect(countsTile(linesCourse, video)).toBe(false);
    expect(countsTile(linesCourse, { type: 'drill' })).toBe(true);
  });

  it('rechnet den Fortschritt aus den angesehenen Videos', () => {
    expect(courseProgress(videoCourse, {}, state())).toEqual({ total: 3, done: 0, percent: 0 });
    expect(courseProgress(videoCourse, {}, state({ videos: { [first.id]: true } }))).toEqual({ total: 3, done: 1, percent: 33 });
  });

  it('schlägt als nächste Kachel das erste ungesehene Video vor', () => {
    expect(nextTile(videoCourse, {}, state()).study.id).toBe(first.id);
    const next = nextTile(videoCourse, {}, state({ videos: { [first.id]: true } }));
    expect(next.study.id).toBe(second.id);
    expect(next.tile.type).toBe('video');
    expect(nextTile(videoCourse, {}, state({ videos: { [first.id]: true, [second.id]: true, [third.id]: true } }))).toBeNull();
  });

  it('gilt ab dem ersten Video als begonnen', () => {
    expect(courseStarted(videoCourse, {}, state())).toBe(false);
    expect(courseStarted(videoCourse, {}, state({ videos: { [first.id]: true } }))).toBe(true);
    expect(courseStarted(videoCourse, {}, state({ started: { [videoCourse.id]: 1 } }))).toBe(true);
    expect(courseStarted(linesCourse, {}, state({ videos: { x: true } }))).toBe(false);
  });

  it('verlinkt die Video-Kachel direkt auf das Video', () => {
    const { tile, study } = nextTile(videoCourse, {}, state());
    expect(tileHref(videoCourse, tile)).toBe(`#/course/${encodeURIComponent(videoCourse.id)}/video/${encodeURIComponent(study.id)}`);
  });
});

describe('Anzeige', () => {
  it('stellt eine Study nur mit Video-Kachel allein in die Mitte', () => {
    expect(tileLayout([{ tile: { type: 'video' } }]).map((e) => [e.col, e.row])).toEqual([[0, 0]]);
  });

  it('der Filter „Videokurse“ zeigt nur Video-Kurse, Weiß und Schwarz keine', () => {
    const courses = [videoCourse, linesCourse];
    expect(filterCourses(courses, { filter: 'video' })).toEqual([videoCourse]);
    expect(filterCourses(courses, { filter: 'w' })).toEqual([linesCourse]);
    expect(filterCourses(courses, { filter: 'b' })).toEqual([]);
    expect(filterCourses(courses, { filter: 'all' })).toHaveLength(2);
  });

  it('beginnt die Startseite mit einem Lernkurs statt mit einem Video-Kurs', () => {
    expect(currentCourse([videoCourse, linesCourse], state())).toBe(linesCourse);
    expect(currentCourse([videoCourse], state())).toBe(videoCourse);
  });
});
