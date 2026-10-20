import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { bookMoves, engineParams, judgeMove, pickBookMove } from '../src/bot.js';
import { buildCourse, buildPositionIndex } from '../src/courseLoader.js';

const PGN = `[Course "Bot"]
[Study "A"]
[Orientation "black"]

1. e4 c6 2. d4 (2. Nc3 d5) 2... d5 *

[Study "B"]
[Orientation "black"]

1. e4 c6 2. d4 d5 3. e5 Bf5 *`;

const course = buildCourse({ pgn: PGN });
const index = buildPositionIndex(course);
const fenAfter = (...sans) => {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess.fen();
};

describe('bookMoves', () => {
  it('fasst Fortsetzungen aller Studies zusammen und gewichtet Hauptzüge', () => {
    const moves = bookMoves(index, fenAfter('e4', 'c6'));
    expect(moves.map((m) => m.san)).toEqual(['d4', 'Nc3']);
    expect(moves[0].weight).toBe(6); // in zwei Studies Hauptfortsetzung
    expect(moves[1].weight).toBe(1);
  });

  it('liefert nichts außerhalb des Repertoires', () => {
    expect(bookMoves(index, fenAfter('d4'))).toEqual([]);
  });
});

describe('pickBookMove', () => {
  const moves = [
    { uci: 'a', weight: 3 },
    { uci: 'b', weight: 1 },
  ];
  it('wählt gewichtet zufällig', () => {
    expect(pickBookMove(moves, () => 0).uci).toBe('a');
    expect(pickBookMove(moves, () => 0.74).uci).toBe('a');
    expect(pickBookMove(moves, () => 0.76).uci).toBe('b');
    expect(pickBookMove([], () => 0)).toBe(null);
  });
});

describe('judgeMove', () => {
  it('erkennt Repertoire-Züge, Abweichungen und Stellungen außerhalb', () => {
    const fen = fenAfter('e4');
    expect(judgeMove(index, fen, 'c7c6').verdict).toBe('book');
    const dev = judgeMove(index, fen, 'e7e5');
    expect(dev.verdict).toBe('deviation');
    expect(dev.expected.map((m) => m.san)).toEqual(['c6']);
    expect(judgeMove(index, fenAfter('e4', 'e5'), 'g1f3').verdict).toBe('outOfBook');
  });
});

describe('engineParams', () => {
  it('begrenzt die Stärke auf 0–20 und skaliert Tiefe und Zeit', () => {
    expect(engineParams(-5).skill).toBe(0);
    expect(engineParams(99).skill).toBe(20);
    expect(engineParams(0).depth).toBeLessThan(engineParams(20).depth);
    expect(engineParams(0).movetime).toBeLessThan(engineParams(20).movetime);
  });
});
