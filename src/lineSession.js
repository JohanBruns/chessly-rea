// Ablauf einer einzelnen Linie im Lern- oder Drill-Modus – ohne DOM,
// damit die Logik testbar bleibt.
import { moveLabel } from './pgnParser.js';

const ROOK_CASTLE = { e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' };

export class LineSession {
  /**
   * @param {object} line   Linie aus buildCourse()
   * @param {object} opts   { mode: 'learn' | 'drill', hintAfterMistakes }
   */
  constructor(line, { mode = 'drill', hintAfterMistakes = 2 } = {}) {
    this.line = line;
    this.mode = mode;
    this.hintAfterMistakes = hintAfterMistakes;
    this.index = 0;
    this.mistakes = 0;
    this.hints = 0;
    this.mistakesHere = 0;
    this.hintShown = false;
  }

  get userColor() {
    return this.line.userColor;
  }

  get finished() {
    return this.index >= this.line.moves.length;
  }

  get lastNode() {
    return this.index > 0 ? this.line.moves[this.index - 1] : null;
  }

  get nextNode() {
    return this.line.moves[this.index] || null;
  }

  get fen() {
    return this.lastNode ? this.lastNode.fen : this.line.startFen;
  }

  get turnColor() {
    return this.fen.split(' ')[1];
  }

  isUserTurn() {
    return !!this.nextNode && this.nextNode.color === this.userColor;
  }

  // Im Lernmodus immer, im Drill nach Hinweis oder zu vielen Fehlern
  showsHint() {
    if (!this.isUserTurn()) return false;
    return this.mode === 'learn' || this.hintShown || this.mistakesHere >= this.hintAfterMistakes;
  }

  useHint() {
    if (!this.isUserTurn()) return null;
    if (this.mode === 'drill' && !this.hintShown) this.hints++;
    this.hintShown = true;
    return this.nextNode;
  }

  /**
   * Prüft einen Zug des Lernenden.
   * @returns {{ status: 'correct' | 'wrong' | 'alternative', expected: object, node?: object }}
   */
  submit({ from, to, promotion }) {
    const expected = this.nextNode;
    if (!expected || !this.isUserTurn()) throw new Error('Der Lernende ist nicht am Zug.');
    let uci = from + to;
    if (expected.san.startsWith('O-O') && ROOK_CASTLE[uci]) uci = ROOK_CASTLE[uci];
    const promo = promotion || (expected.promotion && uci === expected.from + expected.to ? expected.promotion : '');
    uci += promo || '';

    if (uci === expected.uci) {
      this.index++;
      this.mistakesHere = 0;
      this.hintShown = false;
      return { status: 'correct', expected, node: expected };
    }

    // Zug steht auch im Repertoire, gehört aber zu einer anderen Linie
    const siblings = expected.parent ? expected.parent.children : [];
    const alternative = siblings.find((n) => n !== expected && n.uci === uci);
    if (alternative) return { status: 'alternative', expected, node: alternative };

    if (this.mode === 'drill') this.mistakes++;
    this.mistakesHere++;
    return { status: 'wrong', expected };
  }

  // Spielt den nächsten Gegnerzug und gibt ihn zurück.
  playOpponent() {
    if (this.finished || this.isUserTurn()) return null;
    const node = this.nextNode;
    this.index++;
    return node;
  }

  // Erklärungen für den aktuellen Moment (nur im Lernmodus während der Linie).
  explanation() {
    const entries = [];
    const showAll = this.mode === 'learn' || this.finished;
    if (!showAll) return entries;

    if (this.index === 0 && this.line.intro) entries.push({ label: 'Einführung', text: this.line.intro });
    const last = this.lastNode;
    if (last && last.comment) {
      entries.push({ label: moveLabel(last), text: last.comment, own: last.color === this.userColor });
    }
    if (this.mode === 'learn' && this.isUserTurn()) {
      const next = this.nextNode;
      const text = [next.commentBefore, next.comment].filter(Boolean).join(' ');
      entries.push({ label: `Dein Zug: ${moveLabel(next)}`, text: text || 'Spiele den markierten Zug.', own: true });
    }
    return entries;
  }

  // Pfeile/Markierungen für das Brett. PGN-Pfeile gehören (wie bei Lichess)
  // zur Stellung nach dem Zug, an dem sie notiert sind.
  shapes() {
    const shapes = [];
    if (this.mode === 'learn') {
      const annotated = this.lastNode || this.line.moves[0]?.parent;
      if (annotated) shapes.push(...annotated.shapes);
    }
    if (this.showsHint()) {
      const next = this.nextNode;
      shapes.push({ orig: next.from, dest: next.to, brush: 'green' });
    }
    return shapes;
  }

  result() {
    return { mistakes: this.mistakes, hints: this.hints };
  }
}
