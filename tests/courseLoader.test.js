import { describe, expect, it } from 'vitest';
import { buildCourse, slugify } from '../src/courseLoader.js';

const PGN = `[Course "Testkurs"]
[Chapter "Kapitel A"]
[Orientation "black"]

1. e4 c6 2. d4 (2. Nc3 d5) 2... d5 3. e5 (3. exd5 {[%title Abtausch]} cxd5) 3... Bf5 *

[Chapter "Kapitel B"]
[Orientation "white"]

1. d4 d5 2. Bf4 *`;

describe('buildCourse', () => {
  const course = buildCourse({ pgn: PGN });

  it('übernimmt Name, ID und Kapitel', () => {
    expect(course.name).toBe('Testkurs');
    expect(course.id).toBe('testkurs');
    expect(course.chapters.map((c) => c.title)).toEqual(['Kapitel A', 'Kapitel B']);
    expect(course.color).toBe('both');
  });

  it('zerlegt Kapitel in Linien (Blätter des Zugbaums)', () => {
    const [a, b] = course.chapters;
    expect(a.lines).toHaveLength(3);
    expect(b.lines).toHaveLength(1);
    expect(a.lines.map((l) => l.moves.map((n) => n.san).join(' '))).toEqual([
      'e4 c6 d4 d5 e5 Bf5',
      'e4 c6 d4 d5 exd5 cxd5',
      'e4 c6 Nc3 d5',
    ]);
  });

  it('benennt Linien nach Titel oder Abzweigung', () => {
    const names = course.chapters[0].lines.map((l) => l.name);
    expect(names).toEqual(['Hauptvariante', 'Abtausch', '2.Nc3']);
  });

  it('setzt die Spielerfarbe pro Kapitel', () => {
    expect(course.chapters[0].lines[0].userColor).toBe('b');
    expect(course.chapters[1].lines[0].userColor).toBe('w');
  });

  it('erzeugt stabile, eindeutige Linien-IDs', () => {
    const again = buildCourse({ pgn: PGN });
    expect(again.lines.map((l) => l.id)).toEqual(course.lines.map((l) => l.id));
    expect(new Set(course.lines.map((l) => l.id)).size).toBe(course.lines.length);
    expect(course.lines.every((l) => l.id.startsWith('testkurs:'))).toBe(true);
  });

  it('nutzt Lichess-Header (StudyName, Event) als Fallback', () => {
    const pgn = `[Event "Meine Studie: Vorstoß"]\n[StudyName "Meine Studie"]\n[Orientation "black"]\n\n1. e4 c6 *`;
    const c = buildCourse({ pgn });
    expect(c.name).toBe('Meine Studie');
    expect(c.chapters[0].title).toBe('Vorstoß');
  });

  it('lässt Farbe und Name beim Import überschreiben', () => {
    const c = buildCourse({ pgn: '1. e4 c6 *', name: 'Import', color: 'b' });
    expect(c.id).toBe('import');
    expect(c.lines[0].userColor).toBe('b');
  });
});

describe('slugify', () => {
  it('erzeugt URL-taugliche IDs', () => {
    expect(slugify('Caro-Kann-Verteidigung')).toBe('caro-kann-verteidigung');
    expect(slugify('Vorstoß (3.e5)')).toBe('vorstoss-3-e5');
  });
});
