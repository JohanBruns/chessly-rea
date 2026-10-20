// Ablauf einer einzelnen Linie im Lern- oder Wiederholungsmodus – ohne DOM,
// damit die Logik testbar bleibt.
import { moveLabel } from './pgnParser.js';

const ROOK_CASTLE = { e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' };

// Pinsel für den eigenen Zug (Lernpfeil, Lösung) und die Figur-Markierung (Hinweis Stufe 1)
export const MOVE_BRUSH = 'teal';
export const HINT_BRUSH = 'teal';

export class LineSession {
  /**
   * @param {object} line   Linie aus buildCourse()
   * @param {object} opts   { mode: 'learn' | 'drill', hintAfterMistakes }
   *   learn – Pfeil und Kommentar zeigen den Zug, falsche Züge werden still zurückgesetzt
   *   drill – aus dem Gedächtnis; Hinweis in 2 Stufen, Fehler werden gezählt
   */
  constructor(line, { mode = 'drill', hintAfterMistakes = 3 } = {}) {
    this.line = line;
    this.mode = mode;
    this.hintAfterMistakes = hintAfterMistakes;
    this.index = 0;
    this.mistakes = 0;
    this.hints = 0;
    this.mistakesHere = 0;
    this.hintLevel = 0;
    this.viewIndex = null; // null = aktuelle Stellung, sonst Anzahl gezeigter Züge
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

  // ---------- Hinweis ----------
  // 0 = kein Hinweis, 1 = Figur markiert, 2 = Lösung (Pfeil + Kommentar)
  hintStage() {
    if (!this.isUserTurn()) return 0;
    if (this.mode === 'learn') return 2;
    if (this.mistakesHere >= this.hintAfterMistakes) return 2;
    return this.hintLevel;
  }

  showsHint() {
    return this.hintStage() >= 2;
  }

  // Beschriftung des Hinweis-Buttons: erst „Hinweis“, nach dem 1. Klick „Lösung“
  hintButtonLabel() {
    return this.hintStage() >= 1 ? 'Lösung' : 'Hinweis';
  }

  useHint() {
    if (!this.isUserTurn() || this.mode === 'learn') return this.hintStage();
    if (this.hintLevel === 0) this.hints++;
    this.hintLevel = Math.min(2, Math.max(this.hintLevel, this.hintStage()) + 1);
    return this.hintLevel;
  }

  /**
   * Prüft einen Zug des Lernenden.
   * @returns {{ status: 'correct' | 'wrong' | 'alternative', expected: object, node?: object, from, to }}
   */
  submit({ from, to, promotion }) {
    const expected = this.nextNode;
    if (!expected || !this.isUserTurn()) throw new Error('Der Lernende ist nicht am Zug.');
    this.viewIndex = null;
    let uci = from + to;
    if (expected.san.startsWith('O-O') && ROOK_CASTLE[uci]) uci = ROOK_CASTLE[uci];
    const promo = promotion || (expected.promotion && uci === expected.from + expected.to ? expected.promotion : '');
    uci += promo || '';

    if (uci === expected.uci) {
      this.index++;
      this.mistakesHere = 0;
      this.hintLevel = 0;
      return { status: 'correct', expected, node: expected, from, to };
    }

    // Zug steht auch im Repertoire, gehört aber zu einer anderen Linie
    const siblings = expected.parent ? expected.parent.children : [];
    const alternative = siblings.find((n) => n !== expected && n.uci === uci);
    if (alternative) return { status: 'alternative', expected, node: alternative, from, to };

    // Im Lernmodus werden Fehler still zurückgesetzt und nicht gezählt
    if (this.mode === 'drill') {
      this.mistakes++;
      this.mistakesHere++;
    }
    return { status: 'wrong', expected, from, to };
  }

  // Spielt den nächsten Gegnerzug und gibt ihn zurück.
  playOpponent() {
    if (this.finished || this.isUserTurn()) return null;
    const node = this.nextNode;
    this.index++;
    this.viewIndex = null;
    return node;
  }

  // ---------- Brett-Navigation (nur bis zur aktuellen Stellung) ----------
  get isLive() {
    return this.viewIndex === null || this.viewIndex >= this.index;
  }

  get shownIndex() {
    return this.isLive ? this.index : this.viewIndex;
  }

  get shownNode() {
    const i = this.shownIndex;
    return i > 0 ? this.line.moves[i - 1] : null;
  }

  get shownFen() {
    return this.shownNode ? this.shownNode.fen : this.line.startFen;
  }

  /** @param {'first'|'prev'|'next'|'last'} cmd */
  navigate(cmd) {
    const current = this.shownIndex;
    let target = current;
    if (cmd === 'first') target = 0;
    else if (cmd === 'prev') target = Math.max(0, current - 1);
    else if (cmd === 'next') target = Math.min(this.index, current + 1);
    else if (cmd === 'last') target = this.index;
    this.viewIndex = target >= this.index ? null : target;
    return this.shownIndex;
  }

  canNavigate(cmd) {
    const i = this.shownIndex;
    return cmd === 'first' || cmd === 'prev' ? i > 0 : i < this.index;
  }

  // ---------- Erklärungen ----------
  // Lernmodus: Kommentar zur Stellung + Erklärung des eigenen Zugs.
  // Wiederholen: nichts – außer bei der Lösung (Hinweis Stufe 2) und nach Abschluss.
  explanation() {
    const entries = [];
    const learn = this.mode === 'learn';
    if (learn || this.finished) {
      // Einführung bleibt stehen, bis der Lernende seinen ersten Zug gespielt hat
      const ownMovePlayed = this.line.moves.slice(0, this.index).some((n) => n.color === this.userColor);
      if (!ownMovePlayed && this.line.intro) entries.push({ label: 'Einführung', text: this.line.intro });
      const last = this.lastNode;
      if (last && last.comment) {
        entries.push({ label: moveLabel(last), text: last.comment, own: last.color === this.userColor });
      }
    }
    if (this.isUserTurn() && this.showsHint()) {
      const next = this.nextNode;
      const text = [next.commentBefore, next.comment].filter(Boolean).join(' ');
      if (learn || text) entries.push({ label: `Dein Zug: ${moveLabel(next)}`, text: text || 'Spiele den markierten Zug.', own: true, hint: true });
    }
    return entries;
  }

  // Abschluss-Kommentar einer Linie (Kommentar des letzten Zugs) mit seinen Plan-Pfeilen
  summary() {
    const last = this.line.moves[this.line.moves.length - 1];
    return { text: last?.comment || '', shapes: last?.shapes || [] };
  }

  // Pfeile/Markierungen für das Brett. PGN-Pfeile gehören (wie bei Lichess)
  // zur Stellung nach dem Zug, an dem sie notiert sind.
  shapes() {
    const shapes = [];
    if (!this.isLive) {
      if (this.mode === 'learn' && this.shownNode) shapes.push(...this.shownNode.shapes);
      return shapes;
    }
    if (this.mode === 'learn' || this.finished) {
      const annotated = this.lastNode || this.line.moves[0]?.parent;
      if (annotated) shapes.push(...annotated.shapes);
    }
    const stage = this.hintStage();
    const next = this.nextNode;
    if (stage === 1) shapes.push({ orig: next.from, brush: HINT_BRUSH });
    if (stage >= 2) shapes.push({ orig: next.from, dest: next.to, brush: MOVE_BRUSH });
    return shapes;
  }

  result() {
    return { mistakes: this.mistakes, hints: this.hints };
  }
}
