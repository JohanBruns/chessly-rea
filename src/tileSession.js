// Ablauf einer Sitzung aus mehreren Linien – ohne DOM:
//  - Lern-Kachel: pro Variante erst Lernen, dann sofort Wiederholen (2 Segmente je Variante)
//  - Drill-Kachel, Drill Shuffle, Wiederholung: alle Linien gemischt aus dem Gedächtnis
// Linien mit Fehlern werden im Drill einmal hinten angehängt (ohne eigenes Segment).

export function shuffle(arr, random = Math.random) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class TileRun {
  /**
   * @param {object[]} lines
   * @param {object} opts { kind: 'learn' | 'drill', random, retryMistakes }
   */
  constructor(lines, { kind = 'learn', random = Math.random, retryMistakes = true } = {}) {
    this.kind = kind;
    this.retryMistakes = retryMistakes;
    this.lines = kind === 'learn' ? [...lines] : shuffle(lines, random);
    this.steps = this.lines.flatMap((line, i) =>
      kind === 'learn'
        ? [
            { line, variation: i, phase: 'learn', segment: 2 * i },
            { line, variation: i, phase: 'review', segment: 2 * i + 1 },
          ]
        : [{ line, variation: i, phase: 'drill', segment: i }],
    );
    this.segmentCount = this.steps.length;
    this.index = 0;
    this.doneSegments = new Set();
    this.results = [];
  }

  get current() {
    return this.steps[this.index] || null;
  }

  get finished() {
    return this.index >= this.steps.length;
  }

  get variationCount() {
    return this.lines.length;
  }

  /** Segmente des Fortschrittsbalkens: 'done' | 'active' | 'todo' */
  segments() {
    const active = this.current?.segment;
    return Array.from({ length: this.segmentCount }, (_, i) => ({
      state: this.doneSegments.has(i) ? 'done' : i === active ? 'active' : 'todo',
      phase: this.kind === 'learn' ? (i % 2 ? 'review' : 'learn') : 'drill',
    }));
  }

  /**
   * Schließt den aktuellen Schritt ab.
   * @param {{ mistakes: number, hints: number }} result
   * @returns {{ step, variationDone: boolean, retry: boolean }}
   */
  complete(result = { mistakes: 0, hints: 0 }) {
    const step = this.current;
    if (!step) return null;
    this.doneSegments.add(step.segment);
    this.results.push({ step, ...result });
    const variationDone = step.phase !== 'learn';
    let retry = false;
    if (step.phase === 'drill' && result.mistakes > 0 && this.retryMistakes && !step.retry) {
      this.steps.push({ ...step, retry: true });
      retry = true;
    }
    this.index++;
    return { step, variationDone, retry };
  }

  // „Nochmal“ nach dem Lernen: die Variante noch einmal lernen
  redo() {
    const step = this.current;
    const prev = this.steps[this.index - 1];
    if (!prev || prev.phase !== 'learn' || step?.line !== prev.line) return false;
    this.index--;
    this.doneSegments.delete(prev.segment);
    this.results.pop();
    return true;
  }

  // Zusammenfassung: Fehler je Linie (erster Durchgang zählt)
  summary() {
    const perLine = new Map();
    for (const r of this.results) {
      if (r.step.phase === 'learn' || r.step.retry) continue;
      if (!perLine.has(r.step.line.id)) perLine.set(r.step.line.id, r);
    }
    const graded = [...perLine.values()];
    return {
      lines: graded.length,
      perfect: graded.filter((r) => !r.mistakes && !r.hints).length,
      mistakes: graded.reduce((sum, r) => sum + r.mistakes, 0),
    };
  }
}
