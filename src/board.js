// Dünne Hülle um chessground (Brett von Lichess) mit legalen Zügen aus chess.js.
import { Chessground } from '@lichess-org/chessground';
import { Chess } from 'chess.js';

const COLOR = { w: 'white', b: 'black' };

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

export function createBoard(el, { orientation = 'w', coordinates = true, onMove } = {}) {
  const cg = Chessground(el, {
    orientation: COLOR[orientation],
    coordinates,
    animation: { enabled: true, duration: 220 },
    highlight: { lastMove: true, check: true },
    movable: { free: false, color: undefined, showDests: true, events: { after: (orig, dest) => onMove?.(orig, dest) } },
    premovable: { enabled: false },
    draggable: { enabled: true, showGhost: true },
    drawable: { enabled: true, visible: true },
  });
  let destroyed = false;

  return {
    // Stellung zeigen; `interactive` gibt dem Lernenden die Züge seiner Farbe frei
    show(fen, { lastMove, interactive = false, userColor, shapes = [] } = {}) {
      const chess = new Chess(fen);
      const turn = COLOR[chess.turn()];
      cg.set({
        fen,
        turnColor: turn,
        lastMove,
        check: chess.inCheck() ? turn : false,
        movable: {
          color: interactive ? COLOR[userColor] : undefined,
          dests: interactive ? legalDests(fen) : new Map(),
        },
      });
      cg.setAutoShapes(shapes);
    },
    setOrientation(color) {
      cg.set({ orientation: COLOR[color] });
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
