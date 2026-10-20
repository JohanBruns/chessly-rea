// Kurs-Explorer als Dialog: freies Brett, Schalter „Kurszüge anzeigen“ (Pfeile),
// Zugliste und alle Studies, in denen die aktuelle Stellung vorkommt.
import { Chess } from 'chess.js';
import { createBoard, isPromotion } from '../board.js';
import { buildPositionIndex, positionKey } from '../courseLoader.js';
import { add, clear, h } from '../dom.js';
import { loadSettings } from '../storage.js';
import { icon } from '../ui/icons.js';
import { studyHref } from '../ui/studyBlock.js';

// Repertoire-Züge in einer Stellung (über alle Studies, ohne Dubletten)
export function courseMovesAt(index, fen) {
  const entries = index.get(positionKey(fen)) || [];
  const moves = new Map();
  for (const { study, node } of entries) {
    for (const child of node.children) {
      if (!moves.has(child.uci)) moves.set(child.uci, { uci: child.uci, san: child.san, from: child.from, to: child.to, own: child.color === study.userColor, studies: new Set() });
      moves.get(child.uci).studies.add(study);
    }
  }
  return [...moves.values()];
}

// Zugfolge (UCI) vom Anfang der Study bis zu einem Knoten
export function pathTo(node) {
  const path = [];
  for (let n = node; n && n.parent; n = n.parent) path.unshift(n.uci);
  return path;
}

export function openCourseExplorer(course) {
  const index = buildPositionIndex(course);
  const settings = loadSettings();
  const startFen = course.studies[0]?.root.fen || new Chess().fen();
  let history = []; // { fen, san, from, to }
  let showMoves = true;

  const boardEl = h('div', { class: 'board' });
  const movesEl = h('div', { class: 'explorer-moves' });
  const courseMovesEl = h('div', { class: 'explorer-list' });
  const studiesEl = h('div', { class: 'explorer-list' });
  const toggle = h('input', { type: 'checkbox', checked: true, onchange: (e) => ((showMoves = e.target.checked), render()) });

  const fen = () => (history.length ? history[history.length - 1].fen : startFen);

  function play(from, to) {
    const chess = new Chess(fen());
    try {
      const move = chess.move({ from, to, promotion: isPromotion(fen(), from, to) ? 'q' : undefined });
      history.push({ fen: chess.fen(), san: move.san, from: move.from, to: move.to });
    } catch {
      // illegal – Brett wird neu gezeichnet
    }
    render();
  }

  function render() {
    const current = fen();
    const courseMoves = courseMovesAt(index, current);
    const last = history[history.length - 1];
    board.show(current, {
      lastMove: last ? [last.from, last.to] : undefined,
      interactive: true,
      userColor: 'both',
      shapes: showMoves ? courseMoves.map((m) => ({ orig: m.from, dest: m.to, brush: m.own ? 'teal' : 'blue' })) : [],
    });

    clear(movesEl);
    if (!history.length) add(movesEl, h('span', { class: 'muted small' }, 'Ziehe eine Figur, um zu beginnen.'));
    history.forEach((m, i) => {
      const [, , , , , moveNo] = (i ? history[i - 1].fen : startFen).split(' ');
      const white = (i ? history[i - 1].fen : startFen).split(' ')[1] === 'w';
      if (white || i === 0) add(movesEl, h('span', { class: 'move-no' }, `${moveNo}.${white ? '' : '..'}`));
      add(movesEl, h('button', { class: ['move', i === history.length - 1 ? 'current' : ''], onclick: () => ((history = history.slice(0, i + 1)), render()) }, m.san));
    });

    clear(courseMovesEl);
    if (!courseMoves.length) add(courseMovesEl, h('p', { class: 'muted small' }, 'Keine Kurszüge in dieser Stellung.'));
    for (const m of courseMoves) {
      add(
        courseMovesEl,
        h(
          'button',
          { class: ['explorer-move', m.own ? 'own' : ''], onclick: () => play(m.from, m.to) },
          h('strong', {}, m.san),
          h('span', { class: 'muted small' }, `${m.studies.size} Stud${m.studies.size === 1 ? 'y' : 'ies'} · ${m.own ? 'dein Zug' : 'Gegnerzug'}`),
        ),
      );
    }

    clear(studiesEl);
    const entries = index.get(positionKey(current)) || [];
    const seen = new Set();
    for (const { study, node } of entries) {
      if (seen.has(study.id)) continue;
      seen.add(study.id);
      const chapter = course.chapters.find((c) => c.id === study.chapterId);
      const path = pathTo(node).join(',');
      add(
        studiesEl,
        h(
          'a',
          { class: 'explorer-study', href: `${studyHref(course, study)}${path ? `?moves=${path}` : ''}`, onclick: () => dialog.close() },
          h('span', { class: 'study-badge' }, `STUDY ${study.index + 1}`),
          h('div', {}, h('strong', {}, study.title), h('span', { class: 'muted small' }, `Kapitel ${chapter.index + 1} · ${chapter.title}`)),
        ),
      );
    }
    if (!entries.length) add(studiesEl, h('p', { class: 'muted small' }, history.length ? 'Diese Stellung kommt im Kurs nicht vor.' : ''));
  }

  const dialog = h(
    'dialog',
    { class: 'explorer-dialog', 'aria-label': 'Kurs-Explorer' },
    h(
      'header',
      { class: 'dialog-head' },
      h('div', { class: 'dialog-title' }, icon('compass', { size: 22 }), h('strong', {}, 'Kurs-Explorer'), h('span', { class: 'muted' }, course.name)),
      h('button', { class: 'icon-btn', 'aria-label': 'Schließen', onclick: () => dialog.close() }, icon('close')),
    ),
    h(
      'div',
      { class: 'dialog-body explorer-body' },
      h(
        'div',
        { class: 'board-col' },
        h('div', { class: 'board-wrap' }, boardEl),
        h(
          'div',
          { class: 'board-nav' },
          h('button', { class: 'nav-btn', 'aria-label': 'Zum Anfang', onclick: () => ((history = []), render()) }, icon('first')),
          h('button', { class: 'nav-btn', 'aria-label': 'Zug zurück', onclick: () => (history.pop(), render()) }, icon('chevronLeft')),
          h('button', { class: 'nav-btn', 'aria-label': 'Brett drehen', onclick: () => board.toggleOrientation() }, icon('flip')),
        ),
      ),
      h(
        'div',
        { class: 'explorer-side' },
        h('label', { class: 'switch-row' }, h('span', {}, 'Kurszüge anzeigen'), toggle, h('span', { class: 'switch' }, h('span', { class: 'switch-knob' }))),
        h('h3', {}, 'Züge'),
        movesEl,
        h('h3', {}, 'Kurszüge in dieser Stellung'),
        courseMovesEl,
        h('h3', {}, 'Passende Studies'),
        studiesEl,
      ),
    ),
  );
  add(document.body, dialog);
  dialog.showModal();
  const board = createBoard(boardEl, { orientation: course.color === 'b' ? 'b' : 'w', coordinates: settings.showCoordinates, onMove: play });
  dialog.addEventListener('close', () => {
    board.destroy();
    dialog.remove();
  });
  // Schließen durch Klick auf den Hintergrund
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
  render();
  return dialog;
}
