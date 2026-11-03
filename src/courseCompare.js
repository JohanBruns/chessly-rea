// Gleicht einen eigenen Kurs (aus buildCourse) mit einem Chessly-Kurs ab, wie ihn
// downloader/lines.py speichert: Kapitel → Studies → Varianten (Züge mit FEN).
// Verglichen wird über Stellungen, nicht über die Notation – so stört kein "+" oder "#".

// Brett, Zugrecht, Rochade – ohne En-passant-Feld: chess.js setzt es nur, wenn ein
// Schlag en passant möglich ist, Chessly nach jedem Doppelschritt.
function positionKey(fen) {
  return fen.split(' ').slice(0, 3).join(' ');
}

// "12...Rc8" bzw. "13.h3" aus der Stellung vor dem Zug
export function chesslyMoveLabel(move) {
  const [, turn, , , , number] = move.fen.split(' ');
  return `${number}${turn === 'w' ? '.' : '...'}${move.san}`;
}

// Wie weit lässt sich eine Chessly-Variante im eigenen Study-Baum nachspielen?
export function followVariation(root, moves) {
  let node = root;
  for (let i = 0; i < moves.length; i++) {
    const target = positionKey(moves[i].nextFen);
    const child = node.children.find((c) => positionKey(c.fen) === target);
    if (!child) return { depth: i, node };
    node = child;
  }
  return { depth: moves.length, node };
}

// Wie weit liegt eine eigene Variante auf einer der Chessly-Varianten?
function followOwnLine(line, variations) {
  let best = 0;
  for (const variation of variations) {
    let i = 0;
    while (
      i < line.moves.length &&
      i < variation.moves.length &&
      positionKey(line.moves[i].fen) === positionKey(variation.moves[i].nextFen)
    ) {
      i++;
    }
    best = Math.max(best, i);
  }
  return best;
}

function compareVariation(variation, study, allStudies) {
  const moves = variation.moves;
  const { depth, node } = followVariation(study.root, moves);
  const result = { index: variation.index, moves, depth, total: moves.length };
  if (depth === moves.length) return { ...result, status: 'ok' };

  const missing = moves[depth];
  const mover = missing.fen.split(' ')[1];
  let status;
  if (!node.children.length) status = 'kürzer';
  else if (mover === study.userColor) status = 'eigenerZug';
  else status = 'gegnerZug';

  // Steht die Variante in einer anderen eigenen Study vollständiger?
  let elsewhere = null;
  for (const other of allStudies) {
    if (other === study) continue;
    const found = followVariation(other.root, moves).depth;
    if (found > depth && (!elsewhere || found > elsewhere.depth)) elsewhere = { study: other, depth: found };
  }
  return {
    ...result,
    status,
    missing,
    yourMoves: node.children.map((c) => c.san),
    elsewhere,
  };
}

/**
 * @param {object} course   eigener Kurs aus buildCourse
 * @param {object} chessly  Chessly-Kurs aus downloader/lines/<Kurs>.json
 * Kapitel und Studies werden in ihrer Reihenfolge einander zugeordnet.
 */
export function compareCourse(course, chessly) {
  const chapters = chessly.chapters.map((chChapter, ci) => {
    const ownChapter = course.chapters[ci] || null;
    const studies = chChapter.studies.map((chStudy, si) => {
      const ownStudy = ownChapter?.studies[si] || null;
      if (!ownStudy) return { chessly: chStudy, own: null, variations: [], extraLines: [] };
      const variations = chStudy.variations.map((v) => compareVariation(v, ownStudy, course.studies));
      const extraLines = ownStudy.lines
        .map((line) => ({ line, depth: followOwnLine(line, chStudy.variations) }))
        .filter(({ line, depth }) => depth < line.moves.length);
      return { chessly: chStudy, own: ownStudy, variations, extraLines };
    });
    const extraStudies = ownChapter ? ownChapter.studies.slice(chChapter.studies.length) : [];
    return { chessly: chChapter, own: ownChapter, studies, extraStudies };
  });
  const extraChapters = course.chapters.slice(chessly.chapters.length);

  const all = chapters.flatMap((c) => c.studies.flatMap((s) => s.variations));
  const totalVariations = chapters.reduce((n, c) => n + c.studies.reduce((m, s) => m + s.chessly.variations.length, 0), 0);
  return {
    chapters,
    extraChapters,
    summary: {
      chapters: { chessly: chessly.chapters.length, own: course.chapters.length },
      studies: { chessly: chapters.reduce((n, c) => n + c.studies.length, 0), own: course.studies.length },
      variations: totalVariations,
      complete: all.filter((v) => v.status === 'ok').length,
      byStatus: Object.fromEntries(
        ['ok', 'eigenerZug', 'gegnerZug', 'kürzer'].map((s) => [s, all.filter((v) => v.status === s).length]),
      ),
    },
  };
}
