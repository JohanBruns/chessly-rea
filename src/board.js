// Dünne Hülle um chessground (Brett von Lichess) mit legalen Zügen aus chess.js.
import { Chessground } from '@lichess-org/chessground';
import { Chess } from 'chess.js';

const COLOR = { w: 'white', b: 'black', both: 'both' };

// Eigener Pinsel im Akzent-Türkis für Lernpfeile, Hinweise und Lösungen
const BRUSHES = {
  teal: { key: 'tl', color: '#14b8a6', opacity: 0.95, lineWidth: 11 },
};

export function legalDests(fen) {
  const dests = new Map();
  for (const m of new Chess(fen).moves({ verbose: true })) {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  }
  return dests;
}

export function isPromotion(fen, from, to) {
  const piece = new Chess(fen).get(from);
  return !!piece && piece.type === 'p' && (to[1] === '8' || to[1] === '1');
}

// Stellung nach einem (beliebigen legalen) Zug – für das kurze Anzeigen falscher Züge
export function fenAfter(fen, from, to, promotion = 'q') {
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from, to, promotion });
    return move ? { fen: chess.fen(), san: move.san, uci: move.from + move.to + (move.promotion || '') } : null;
  } catch {
    return null;
  }
}

// Rotes Minus-Abzeichen oben rechts an der Figur (falscher Zug)
export function mistakeBadge(square) {
  return {
    orig: square,
    customSvg: {
      html: '<g class="badge-wrong"><circle cx="30" cy="-30" r="16" fill="#ef4444" stroke="#fff" stroke-width="3.5"/><rect x="21" y="-33" width="18" height="6" rx="2" fill="#fff"/></g>',
    },
  };
}

// Grünes Häkchen-Abzeichen (richtiger Zug)
export function correctBadge(square) {
  return {
    orig: square,
    customSvg: {
      html: '<g class="badge-right"><circle cx="30" cy="-30" r="16" fill="#14b8a6" stroke="#fff" stroke-width="3.5"/><path d="M22 -30l5.5 5.5 10-11" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>',
    },
  };
}

export function createBoard(el, { orientation = 'w', coordinates = true, onMove } = {}) {
  const cg = Chessground(el, {
    orientation: COLOR[orientation],
    coordinates,
    ranksPosition: 'left', // Zahlen links; chessground färbt sie dann passend zum Feld darunter
    animation: { enabled: true, duration: 220 },
    highlight: { lastMove: true, check: true },
    movable: { free: false, color: undefined, showDests: true, events: { after: (orig, dest) => onMove?.(orig, dest) } },
    premovable: { enabled: false },
    draggable: { enabled: true, showGhost: true },
    drawable: { enabled: true, visible: true, brushes: BRUSHES },
  });
  let destroyed = false;

  // chessground merkt sich die Brettposition und erneuert sie nur beim Scrollen oder bei einer
  // Größenänderung. Rutscht das Brett, weil sich der Inhalt darüber ändert, träfe jeder Tipp ein
  // falsches Feld. Darum vor jeder Berührung neu messen (Capture läuft vor dem Handler am Brett).
  const remeasure = () => cg.state.dom.bounds.clear();
  for (const type of ['touchstart', 'mousedown']) el.addEventListener(type, remeasure, { capture: true, passive: true });

  return {
    // Stellung zeigen; `interactive` gibt dem Lernenden die Züge seiner Farbe frei ('both' = beide)
    show(fen, { lastMove, interactive = false, userColor, shapes = [], dests } = {}) {
      const chess = new Chess(fen);
      const turn = COLOR[chess.turn()];
      cg.set({
        fen,
        turnColor: turn,
        lastMove,
        check: chess.inCheck() ? turn : false,
        movable: {
          color: interactive ? COLOR[userColor] : undefined,
          dests: interactive ? dests || legalDests(fen) : new Map(),
        },
      });
      cg.setAutoShapes(shapes);
    },
    setOrientation(color) {
      cg.set({ orientation: COLOR[color] });
    },
    toggleOrientation() {
      cg.toggleOrientation();
    },
    get orientation() {
      return cg.state.orientation === 'white' ? 'w' : 'b';
    },
    setShapes(shapes) {
      cg.setAutoShapes(shapes);
    },
    // Züge sperren, ohne die Stellung zu ändern
    lock() {
      cg.set({ movable: { color: undefined, dests: new Map() } });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cg.destroy();
    },
  };
}

// Lichess-Analysebrett für eine Stellung
export function lichessAnalysisUrl(fen) {
  return `https://lichess.org/analysis/standard/${fen.replace(/ /g, '_')}`;
}
