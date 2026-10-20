import { describe, expect, it } from 'vitest';
import { buildCourse } from '../src/courseLoader.js';
import { LineSession } from '../src/lineSession.js';

const course = buildCourse({
  pgn: `[Orientation "black"]\n\n1. e4 {Zentrum} c6 {Caro-Kann} 2. d4 d5 (2... e6) 3. Nc3 dxe4 *`,
});
const line = course.lines[0];

function play(session) {
  while (!session.finished) {
    if (session.isUserTurn()) {
      const n = session.nextNode;
      session.submit({ from: n.from, to: n.to });
    } else {
      session.playOpponent();
    }
  }
}

describe('LineSession', () => {
  it('spielt Gegnerzüge automatisch und erwartet die eigenen Züge', () => {
    const s = new LineSession(line, { mode: 'drill' });
    expect(s.isUserTurn()).toBe(false);
    expect(s.playOpponent().san).toBe('e4');
    expect(s.isUserTurn()).toBe(true);
    expect(s.submit({ from: 'c7', to: 'c6' }).status).toBe('correct');
    play(s);
    expect(s.finished).toBe(true);
    expect(s.result()).toEqual({ mistakes: 0, hints: 0 });
  });

  it('zählt falsche Züge und zeigt danach einen Hinweis', () => {
    const s = new LineSession(line, { mode: 'drill', hintAfterMistakes: 2 });
    s.playOpponent();
    expect(s.submit({ from: 'e7', to: 'e5' }).status).toBe('wrong');
    expect(s.showsHint()).toBe(false);
    s.submit({ from: 'd7', to: 'd5' });
    expect(s.showsHint()).toBe(true);
    expect(s.shapes()[0]).toMatchObject({ orig: 'c7', dest: 'c6' });
    expect(s.result().mistakes).toBe(2);
  });

  it('erkennt Repertoire-Alternativen ohne Fehler zu zählen', () => {
    const s = new LineSession(line, { mode: 'drill' });
    s.playOpponent();
    s.submit({ from: 'c7', to: 'c6' });
    s.playOpponent();
    const r = s.submit({ from: 'e7', to: 'e6' });
    expect(r.status).toBe('alternative');
    expect(s.result().mistakes).toBe(0);
  });

  it('zeigt im Lernmodus Pfeile und Erklärungen', () => {
    const s = new LineSession(line, { mode: 'learn' });
    s.playOpponent();
    expect(s.showsHint()).toBe(true);
    const texts = s.explanation().map((e) => e.text);
    expect(texts).toContain('Zentrum');
    expect(texts).toContain('Caro-Kann');
  });

  it('zeigt PGN-Pfeile in der Stellung nach dem annotierten Zug', () => {
    const c = buildCourse({ pgn: '[Orientation "black"]\n\n1. e4 {[%cal Rd1h5]} c6 *' });
    const s = new LineSession(c.lines[0], { mode: 'learn' });
    expect(s.shapes()).toEqual([]);
    s.playOpponent();
    expect(s.shapes()).toEqual([
      { orig: 'd1', dest: 'h5', brush: 'red' },
      { orig: 'c7', dest: 'c6', brush: 'teal' },
    ]);
  });

  it('Hinweis im Drill wird gezählt', () => {
    const s = new LineSession(line, { mode: 'drill' });
    s.playOpponent();
    s.useHint();
    s.useHint();
    expect(s.result().hints).toBe(1);
  });

  it('normalisiert Rochade über den Turm', () => {
    const c = buildCourse({ pgn: '[Orientation "white"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O *' });
    const s = new LineSession(c.lines[0], { mode: 'drill' });
    for (let i = 0; i < 6; i++) {
      if (s.isUserTurn()) s.submit({ from: s.nextNode.from, to: s.nextNode.to });
      else s.playOpponent();
    }
    expect(s.submit({ from: 'e1', to: 'h1' }).status).toBe('correct');
  });

  it('Hinweis in zwei Stufen: erst Figur, dann Lösung mit Pfeil', () => {
    const s = new LineSession(line, { mode: 'drill' });
    s.playOpponent();
    expect(s.hintButtonLabel()).toBe('Hinweis');
    expect(s.shapes()).toEqual([]);
    expect(s.useHint()).toBe(1);
    expect(s.shapes()).toEqual([{ orig: 'c7', brush: 'teal' }]);
    expect(s.hintButtonLabel()).toBe('Lösung');
    expect(s.explanation()).toEqual([]);
    expect(s.useHint()).toBe(2);
    expect(s.shapes()).toEqual([{ orig: 'c7', dest: 'c6', brush: 'teal' }]);
    expect(s.explanation().map((e) => e.text)).toContain('Caro-Kann');
    s.submit({ from: 'c7', to: 'c6' });
    expect(s.hintLevel).toBe(0);
    expect(s.result().hints).toBe(1);
  });

  it('zählt im Lernmodus keine Fehler', () => {
    const s = new LineSession(line, { mode: 'learn' });
    s.playOpponent();
    const r = s.submit({ from: 'e7', to: 'e5' });
    expect(r).toMatchObject({ status: 'wrong', from: 'e7', to: 'e5' });
    expect(s.result().mistakes).toBe(0);
    expect(s.index).toBe(1);
  });

  it('zeigt die Einführung bis zum ersten eigenen Zug', () => {
    const c = buildCourse({ pgn: '[Orientation "black"]\n\n{Willkommen} 1. e4 c6 2. d4 d5 *' });
    const s = new LineSession(c.lines[0], { mode: 'learn' });
    s.playOpponent();
    expect(s.explanation()[0]).toMatchObject({ label: 'Einführung', text: 'Willkommen' });
    s.submit({ from: 'c7', to: 'c6' });
    s.playOpponent();
    expect(s.explanation().some((e) => e.label === 'Einführung')).toBe(false);
  });

  it('navigiert nur bis zur aktuellen Stellung', () => {
    const s = new LineSession(line, { mode: 'drill' });
    s.playOpponent();
    s.submit({ from: 'c7', to: 'c6' });
    s.playOpponent();
    expect(s.index).toBe(3);
    expect(s.canNavigate('next')).toBe(false);
    expect(s.navigate('next')).toBe(3);
    expect(s.isLive).toBe(true);
    expect(s.navigate('prev')).toBe(2);
    expect(s.isLive).toBe(false);
    expect(s.shownFen).toBe(line.moves[1].fen);
    expect(s.navigate('first')).toBe(0);
    expect(s.shownFen).toBe(line.startFen);
    expect(s.canNavigate('prev')).toBe(false);
    expect(s.navigate('last')).toBe(3);
    expect(s.isLive).toBe(true);
    s.navigate('first');
    s.submit({ from: 'd7', to: 'd5' });
    expect(s.isLive).toBe(true);
  });

  it('liefert den Abschluss-Kommentar mit Plan-Pfeilen', () => {
    const c = buildCourse({ pgn: '[Orientation "black"]\n\n1. e4 c6 {Plan: d5 [%cal Gd7d5]} *' });
    const s = new LineSession(c.lines[0], { mode: 'learn' });
    expect(s.summary()).toEqual({ text: 'Plan: d5', shapes: [{ orig: 'd7', dest: 'd5', brush: 'green' }] });
  });
});
