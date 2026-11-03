// Prüft alle mitgelieferten Repertoire-Dateien: parsen, legal, sinnvoll aufgebaut.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCourse } from '../src/courseLoader.js';
import { compareCourse } from '../src/courseCompare.js';
import { parsePgn } from '../src/pgnParser.js';

const dir = join(import.meta.dirname, '..', 'openings');
const files = readdirSync(dir).filter((f) => f.endsWith('.pgn'));
const linesDir = join(import.meta.dirname, '..', 'downloader', 'lines');
const chesslyCourses = readdirSync(linesDir)
  .filter((f) => f.endsWith('.json') && !f.endsWith('.de.json'))
  .map((f) => JSON.parse(readFileSync(join(linesDir, f), 'utf8')));

describe('mitgelieferte Eröffnungen', () => {
  it('es gibt Repertoire-Dateien', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const course = buildCourse({ pgn: readFileSync(join(dir, file), 'utf8'), fileName: file });

      it('hat Kapitel, Studies und Varianten', () => {
        expect(course.chapters.length).toBeGreaterThan(1);
        for (const chapter of course.chapters) {
          expect(chapter.studies.length, chapter.title).toBeGreaterThan(0);
          for (const study of chapter.studies) expect(study.lines.length, study.title).toBeGreaterThan(0);
        }
      });

      it('hat eindeutige Variantennamen pro Study', () => {
        for (const study of course.studies) {
          const names = study.lines.map((l) => l.name);
          expect(new Set(names).size, `${study.title}: ${names.join(' | ')}`).toBe(names.length);
        }
      });

      // Die Varianten stammen von Chessly (scripts/buildFromChessly.js) – einige enden dort mit einem Gegnerzug.
      it('enthält jede Chessly-Variante vollständig', () => {
        const chesslyId = parsePgn(readFileSync(join(dir, file), 'utf8'))[0].headers.ChesslyCourse;
        const chessly = chesslyCourses.find((c) => c.id === chesslyId);
        if (!chessly) return;
        const { summary } = compareCourse(course, chessly);
        expect(summary.studies.own).toBe(summary.studies.chessly);
        expect(summary.complete).toBe(summary.variations);
      });

      it('erklärt jede Variante und jede Study', () => {
        for (const line of course.lines) expect(line.moves.some((n) => n.comment), line.name).toBe(true);
        for (const study of course.studies) expect(study.description, study.title).not.toBe('');
      });
    });
  }
});
