import { describe, expect, it } from 'vitest';
import { parsePgn, parseComment, moveLabel, PgnError } from '../src/pgnParser.js';

describe('parsePgn', () => {
  it('liest Header, Züge und Kommentare', () => {
    const [game] = parsePgn('[Event "Test"]\n[Orientation "black"]\n\n1. e4 {Zentrum} c6 2. d4 d5 *');
    expect(game.headers.Event).toBe('Test');
    expect(game.headers.Orientation).toBe('black');
    const e4 = game.root.children[0];
    expect(e4.san).toBe('e4');
    expect(e4.comment).toBe('Zentrum');
    expect(e4.uci).toBe('e2e4');
    const d5 = e4.children[0].children[0].children[0];
    expect(moveLabel(d5)).toBe('2...d5');
  });

  it('baut Varianten als Geschwisterknoten', () => {
    const [game] = parsePgn('1. e4 c6 (1... e5 2. Nf3) (1... c5) 2. d4 *');
    const e4 = game.root.children[0];
    expect(e4.children.map((n) => n.san)).toEqual(['c6', 'e5', 'c5']);
    expect(e4.children[0].children[0].san).toBe('d4');
    expect(e4.children[1].children[0].san).toBe('Nf3');
  });

  it('verarbeitet verschachtelte Varianten', () => {
    const [game] = parsePgn('1. d4 d5 2. Bf4 (2. c4 e6 (2... c6 3. Nf3)) 2... Nf6 *');
    const d5 = game.root.children[0].children[0];
    expect(d5.children.map((n) => n.san)).toEqual(['Bf4', 'c4']);
    const c4 = d5.children[1];
    expect(c4.children.map((n) => n.san)).toEqual(['e6', 'c6']);
    expect(d5.children[0].children[0].san).toBe('Nf6');
  });

  it('trennt mehrere Partien', () => {
    const games = parsePgn('[Event "A"]\n1. e4 *\n\n[Event "B"]\n1. d4 1-0\n');
    expect(games).toHaveLength(2);
    expect(games[1].headers.Event).toBe('B');
    expect(games[1].root.children[0].san).toBe('d4');
  });

  it('erkennt NAGs und Zug-Suffixe', () => {
    const [game] = parsePgn('1. e4! e5?! 2. Nf3 $1 *');
    const e4 = game.root.children[0];
    expect(e4.nags).toEqual([1]);
    expect(e4.children[0].nags).toEqual([6]);
    expect(e4.children[0].children[0].nags).toEqual([1]);
  });

  it('akzeptiert Zugnummern direkt am Zug und 0-0', () => {
    const [game] = parsePgn('1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.0-0 *');
    let node = game.root;
    while (node.children.length) node = node.children[0];
    expect(node.san).toBe('O-O');
  });

  it('wirft bei illegalen Zügen einen verständlichen Fehler', () => {
    expect(() => parsePgn('1. e4 e5 2. Ke3 Ke6 3. Qh5 Qxh5 4. Kf7 *')).toThrow(PgnError);
    expect(() => parsePgn('1. e5 *')).toThrow(/Ungültiger Zug "e5"/);
  });

  it('startet aus FEN-Header', () => {
    const fen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const [game] = parsePgn(`[SetUp "1"]\n[FEN "${fen}"]\n\n2. Nf3 *`);
    expect(game.root.fen).toBe(fen);
    expect(game.root.children[0].moveNumber).toBe(2);
  });

  it('hängt Kommentare am Variantenanfang an den ersten Zug der Variante', () => {
    const [game] = parsePgn('1. e4 ({Alternative:} 1. d4) 1... e5 *');
    const d4 = game.root.children[1];
    expect(d4.commentBefore).toBe('Alternative:');
  });
});

describe('parseComment', () => {
  it('extrahiert Lichess-Pfeile, Kreise und Titel', () => {
    const r = parseComment('Gut! [%cal Ge2e4,Rd7d5] [%csl Yd4] [%clk 0:05:00] [%title Hauptlinie]');
    expect(r.text).toBe('Gut!');
    expect(r.title).toBe('Hauptlinie');
    expect(r.shapes).toEqual([
      { orig: 'e2', dest: 'e4', brush: 'green' },
      { orig: 'd7', dest: 'd5', brush: 'red' },
      { orig: 'd4', brush: 'yellow' },
    ]);
  });
});
