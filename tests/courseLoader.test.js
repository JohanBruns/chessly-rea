import { describe, expect, it } from 'vitest';
import { buildCourse, buildPositionIndex, positionKey, slugify } from '../src/courseLoader.js';

const PGN = `[Course "Testkurs"]
[Chapter "Kapitel A"]
[Study "Study A1"]
[Orientation "black"]

1. e4 c6 2. d4 (2. Nc3 d5) 2... d5 3. e5 (3. exd5 {[%title Abtausch]} cxd5) 3... Bf5 *

[Chapter "Kapitel A"]
[Study "Study A2"]
[Video "https://example.com/video"]
[Orientation "black"]

1. e4 c6 2. c4 d5 *

[Chapter "Kapitel B"]
[Study "Study B1"]
[Orientation "white"]

1. d4 d5 2. Bf4 *`;

describe('buildCourse', () => {
  const course = buildCourse({ pgn: PGN });

  it('übernimmt Name, ID und gruppiert Studies in Kapitel', () => {
    expect(course.name).toBe('Testkurs');
    expect(course.id).toBe('testkurs');
    expect(course.chapters.map((c) => c.title)).toEqual(['Kapitel A', 'Kapitel B']);
    expect(course.chapters[0].studies.map((s) => s.title)).toEqual(['Study A1', 'Study A2']);
    expect(course.color).toBe('both');
    expect(course.studies).toHaveLength(3);
  });

  it('zerlegt Studies in Varianten (Blätter des Zugbaums)', () => {
    const study = course.chapters[0].studies[0];
    expect(study.lines.map((l) => l.moves.map((n) => n.san).join(' '))).toEqual([
      'e4 c6 d4 d5 e5 Bf5',
      'e4 c6 d4 d5 exd5 cxd5',
      'e4 c6 Nc3 d5',
    ]);
    expect(study.lines.map((l) => l.variation)).toEqual([1, 2, 3]);
  });

  it('benennt Varianten nach Titel oder Abzweigung', () => {
    expect(course.chapters[0].studies[0].lines.map((l) => l.name)).toEqual(['Hauptvariante', 'Abtausch', '2.Nc3']);
  });

  it('baut den Lernpfad: Lern-Kacheln zu je 2 Varianten + Drill-Kachel', () => {
    const [a1, a2] = course.chapters[0].studies;
    expect(a1.tiles.map((t) => t.type)).toEqual(['learn', 'learn', 'drill']);
    expect(a1.tiles[0].lines).toHaveLength(2);
    expect(a1.tiles[1].lines).toHaveLength(1);
    expect(a1.tiles[1].firstVariation).toBe(3);
    expect(a1.tiles[2].lines).toHaveLength(3);
    expect(a2.tiles.map((t) => t.type)).toEqual(['video', 'learn', 'drill']);
    expect(a2.video).toBe('https://example.com/video');
  });

  it('setzt die Spielerfarbe pro Study', () => {
    expect(course.chapters[0].studies[0].userColor).toBe('b');
    expect(course.chapters[1].studies[0].lines[0].userColor).toBe('w');
  });

  it('erzeugt stabile, eindeutige IDs', () => {
    const again = buildCourse({ pgn: PGN });
    expect(again.lines.map((l) => l.id)).toEqual(course.lines.map((l) => l.id));
    expect(new Set(course.lines.map((l) => l.id)).size).toBe(course.lines.length);
    expect(new Set(course.tiles.map((t) => t.id)).size).toBe(course.tiles.length);
    expect(course.lines.every((l) => l.id.startsWith('testkurs:'))).toBe(true);
  });

  it('nutzt Lichess-Header als Fallback (Studie = Kurs, Kapitel = Study)', () => {
    const pgn = `[Event "Meine Studie: Vorstoß"]\n[StudyName "Meine Studie"]\n[ChapterName "Vorstoß"]\n[Orientation "black"]\n\n1. e4 c6 *\n\n[Event "Meine Studie: Abtausch"]\n[StudyName "Meine Studie"]\n[ChapterName "Abtausch"]\n[Orientation "black"]\n\n1. e4 c6 2. d4 d5 3. exd5 cxd5 *`;
    const c = buildCourse({ pgn });
    expect(c.name).toBe('Meine Studie');
    expect(c.chapters).toHaveLength(1);
    expect(c.chapters[0].studies.map((s) => s.title)).toEqual(['Vorstoß', 'Abtausch']);
  });

  it('lässt Farbe und Name beim Import überschreiben', () => {
    const c = buildCourse({ pgn: '1. e4 c6 *', name: 'Import', color: 'b' });
    expect(c.id).toBe('import');
    expect(c.lines[0].userColor).toBe('b');
  });
});

describe('buildPositionIndex', () => {
  it('findet alle Studies, in denen eine Stellung vorkommt', () => {
    const course = buildCourse({ pgn: PGN });
    const index = buildPositionIndex(course);
    const afterC6 = course.chapters[0].studies[0].root.children[0].children[0].fen;
    const hits = index.get(positionKey(afterC6));
    expect(new Set(hits.map((h) => h.study.title))).toEqual(new Set(['Study A1', 'Study A2']));
  });
});

describe('slugify', () => {
  it('erzeugt URL-taugliche IDs', () => {
    expect(slugify('Caro-Kann-Verteidigung')).toBe('caro-kann-verteidigung');
    expect(slugify('Vorstoß (3.e5)')).toBe('vorstoss-3-e5');
  });
});
