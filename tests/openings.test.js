// Prüft alle mitgelieferten Repertoire-Dateien: parsen, legal, sinnvoll aufgebaut.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCourse } from '../src/courseLoader.js';

const dir = join(import.meta.dirname, '..', 'openings');
const files = readdirSync(dir).filter((f) => f.endsWith('.pgn'));

describe('mitgelieferte Eröffnungen', () => {
  it('es gibt Repertoire-Dateien', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const course = buildCourse({ pgn: readFileSync(join(dir, file), 'utf8'), fileName: file });

      it('hat Kapitel und Linien', () => {
        expect(course.chapters.length).toBeGreaterThan(0);
        for (const chapter of course.chapters) expect(chapter.lines.length).toBeGreaterThan(0);
      });

      it('hat eindeutige Liniennamen pro Kapitel', () => {
        for (const chapter of course.chapters) {
          const names = chapter.lines.map((l) => l.name);
          expect(new Set(names).size, `${chapter.title}: ${names.join(' | ')}`).toBe(names.length);
        }
      });

      it('endet jede Linie mit einem eigenen Zug', () => {
        for (const line of course.lines) {
          const last = line.moves[line.moves.length - 1];
          expect(last.color, `${line.chapterTitle} – ${line.name}`).toBe(line.userColor);
        }
      });

      it('erklärt jede Linie mindestens einmal', () => {
        for (const line of course.lines) {
          expect(line.moves.some((n) => n.comment), line.name).toBe(true);
        }
      });
    });
  }
});
