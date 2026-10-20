// Bot-Logik ohne DOM: Solange die Stellung im Repertoire steht, spielt der Bot Repertoire-Züge
// (Hauptfortsetzung bevorzugt), danach übernimmt die Engine.
import { positionKey } from './courseLoader.js';

/**
 * Repertoire-Fortsetzungen einer Stellung (über alle Studies, ohne Dubletten).
 * `weight` zählt, wie oft der Zug als Hauptfortsetzung (erstes Kind) bzw. überhaupt vorkommt.
 */
export function bookMoves(index, fen) {
  const entries = index.get(positionKey(fen)) || [];
  const moves = new Map();
  for (const { node } of entries) {
    node.children.forEach((child, i) => {
      const entry = moves.get(child.uci) || { uci: child.uci, san: child.san, from: child.from, to: child.to, promotion: child.promotion, weight: 0, node: child };
      entry.weight += i === 0 ? 3 : 1;
      moves.set(child.uci, entry);
    });
  }
  return [...moves.values()].sort((a, b) => b.weight - a.weight);
}

// Gewichtete Zufallsauswahl – so übt man auch die Nebenvarianten
export function pickBookMove(moves, random = Math.random) {
  if (!moves.length) return null;
  const total = moves.reduce((sum, m) => sum + m.weight, 0);
  let r = random() * total;
  for (const m of moves) {
    r -= m.weight;
    if (r < 0) return m;
  }
  return moves[moves.length - 1];
}

/**
 * Bewertet den Zug des Spielers gegenüber dem Repertoire.
 * @returns {'book' | 'deviation' | 'outOfBook'}
 *   book – Zug steht im Repertoire; deviation – Repertoire hatte hier einen anderen Zug;
 *   outOfBook – Stellung war schon nicht mehr im Repertoire
 */
export function judgeMove(index, fenBefore, uci) {
  const moves = bookMoves(index, fenBefore);
  if (!moves.length) return { verdict: 'outOfBook', expected: [] };
  if (moves.some((m) => m.uci === uci)) return { verdict: 'book', expected: moves };
  return { verdict: 'deviation', expected: moves };
}

// Spielstärke 0–20 → Bedenkzeit und Suchtiefe für Stockfish
export function engineParams(skill) {
  const s = Math.max(0, Math.min(20, Number(skill) || 0));
  return { skill: s, depth: Math.max(1, Math.round(2 + s * 0.7)), movetime: 150 + s * 40 };
}
