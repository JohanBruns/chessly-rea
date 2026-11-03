import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildCourse } from '../src/courseLoader.js';
import { chesslyMoveLabel, compareCourse } from '../src/courseCompare.js';

const PGN = `[Course "Testkurs"]
[Chapter "Kapitel A"]
[Study "Study A1"]
[Orientation "black"]

1. e4 c6 2. d4 d5 3. e5 (3. exd5 cxd5) 3... Bf5 *

[Chapter "Kapitel A"]
[Study "Study A2"]
[Orientation "black"]

1. e4 c6 2. Nc3 d5 3. Nf3 Bg4 *`;

// Variante im Format von downloader/lines.py – mit En-passant-Feld nach jedem Doppelschritt wie bei Chessly
function variation(index, sans) {
  const chess = new Chess();
  const moves = sans.split(' ').map((san) => {
    const fen = chess.fen();
    const move = chess.move(san);
    let nextFen = chess.fen();
    if (move.flags.includes('b')) {
      const parts = nextFen.split(' ');
      parts[3] = move.from[0] + (move.color === 'w' ? '3' : '6');
      nextFen = parts.join(' ');
    }
    return { fen, san: move.san, nextFen };
  });
  return { id: `v${index}`, index, startFen: moves[0].fen, moves };
}

const CHESSLY = {
  id: 'kurs',
  name: 'Test Course',
  chapters: [
    {
      name: 'Chapter A',
      studies: [
        {
          name: 'Study 1',
          hasVideo: false,
          variations: [
            variation(1, 'e4 c6 d4 d5 e5 Bf5'),
            variation(2, 'e4 c6 d4 d5 e5 Bf5 Nf3 e6'),
            variation(3, 'e4 c6 d4 d5 Nc3 dxe4'),
            variation(4, 'e4 c6 d4 d5 exd5 Qxd5'),
            variation(5, 'e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3'),
          ],
        },
        { name: 'Study 2', hasVideo: false, variations: [] },
      ],
    },
  ],
};

describe('compareCourse', () => {
  const result = compareCourse(buildCourse({ pgn: PGN }), CHESSLY);
  const [first] = result.chapters[0].studies;
  const status = first.variations.map((v) => v.status);

  it('erkennt vollständige, kürzere und abweichende Varianten', () => {
    expect(status).toEqual(['ok', 'kürzer', 'gegnerZug', 'eigenerZug', 'gegnerZug']);
    expect(chesslyMoveLabel(first.variations[1].missing)).toBe('4.Nf3');
    expect(first.variations[3].yourMoves).toEqual(['cxd5']);
  });

  it('findet Varianten, die in einer anderen eigenen Study weiter gehen', () => {
    expect(first.variations[4].elsewhere.study.title).toBe('Study A2');
    expect(first.variations[4].elsewhere.depth).toBe(6);
  });

  it('meldet eigene Linien, die Chessly so nicht hat', () => {
    expect(first.extraLines.map((e) => e.line.name)).toEqual(['3.exd5']);
  });

  it('zählt das Ergebnis zusammen', () => {
    expect(result.summary.complete).toBe(1);
    expect(result.summary.byStatus).toEqual({ ok: 1, eigenerZug: 1, gegnerZug: 2, kürzer: 1 });
    expect(result.summary.studies).toEqual({ chessly: 2, own: 2 });
  });
});
