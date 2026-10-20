// Study-Linien-Explorer: Brett mit Navigation durch den Zugbaum einer Study und eine Karte
// „Nächster Zug“ mit Chips für die Varianten, die diesen Zug enthalten.
import { createBoard } from '../board.js';
import { findCourse } from '../courses.js';
import { add, clear, h } from '../dom.js';
import { moveLabel } from '../pgnParser.js';
import { tileStates } from '../progress.js';
import { loadProgress, loadSettings, loadState } from '../storage.js';
import { courseIcon } from '../ui/courseIcon.js';
import { icon } from '../ui/icons.js';
import { tileHref } from '../ui/studyBlock.js';

// Varianten (Linien) einer Study, die durch einen Knoten laufen
export function linesThrough(study, node) {
  if (!node.parent) return study.lines;
  return study.lines.filter((line) => line.moves[node.ply - study.root.ply - 1] === node);
}

export function renderStudyExplorer(root, { courseId, studyId }) {
  const course = findCourse(courseId);
  const study = course?.studies.find((s) => s.id === studyId);
  if (!study) {
    add(root, h('div', { class: 'card empty-state' }, h('h2', {}, 'Study nicht gefunden'), h('a', { class: 'btn btn-primary', href: '#/courses' }, 'Zu den Kursen')));
    return null;
  }
  const chapter = course.chapters.find((c) => c.id === study.chapterId);
  const settings = loadSettings();
  const states = tileStates(study, loadProgress(), loadState());
  const backHref = `#/course/${encodeURIComponent(course.id)}?study=${encodeURIComponent(study.id)}`;

  // Startknoten aus ?moves=e2e4,c7c6 (vom Kurs-Explorer)
  let node = study.root;
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  for (const uci of (query.get('moves') || '').split(',').filter(Boolean)) {
    const child = node.children.find((c) => c.uci === uci);
    if (!child) break;
    node = child;
  }
  let followed = null; // gewählte Variante für „vor“ / „Ende“

  const boardEl = h('div', { class: 'board' });
  const nextEl = h('div', { class: 'next-card' });
  const commentEl = h('div', { class: 'comment-card' });
  const movesEl = h('div', { class: 'explorer-moves' });

  const continuation = (n) => {
    if (!n.children.length) return null;
    if (followed) {
      const idx = n.ply - study.root.ply;
      const candidate = followed.moves[idx];
      if (candidate && candidate.parent === n) return candidate;
    }
    return n.children[0];
  };

  function go(target) {
    node = target;
    if (followed && !linesThrough(study, node).includes(followed)) followed = null;
    render();
  }

  const nav = {
    first: () => go(study.root),
    prev: () => node.parent && go(node.parent),
    next: () => continuation(node) && go(continuation(node)),
    last: () => {
      let n = node;
      while (continuation(n)) n = continuation(n);
      go(n);
    },
  };

  function tileFor(line) {
    return states.find((e) => e.tile.type === 'learn' && e.tile.lines.includes(line));
  }

  function chip(line) {
    const entry = tileFor(line);
    return h(
      'button',
      {
        class: ['var-chip', followed === line ? 'active' : '', entry?.status === 'completed' ? 'done' : ''],
        title: line.name,
        onclick: () => {
          followed = followed === line ? null : line;
          render();
        },
      },
      h('span', { class: 'var-num' }, String(line.variation)),
      h('span', {}, line.name),
    );
  }

  function render() {
    const childMoves = node.children;
    const shapes = [...node.shapes, ...childMoves.map((c) => ({ orig: c.from, dest: c.to, brush: c.color === study.userColor ? 'teal' : 'blue' }))];
    board.show(node.fen, {
      lastMove: node.parent ? [node.from, node.to] : undefined,
      interactive: childMoves.length > 0,
      userColor: node.fen.split(' ')[1],
      dests: new Map(childMoves.reduce((acc, c) => acc.set(c.from, [...(acc.get(c.from) || []), c.to]), new Map())),
      shapes,
    });

    clear(commentEl);
    const text = node.parent ? node.comment : study.description;
    add(commentEl, h('div', { class: 'comment-label' }, node.parent ? moveLabel(node) : 'Study'), h('p', {}, text || h('span', { class: 'muted' }, 'Kein Kommentar zu diesem Zug.')));

    clear(nextEl);
    if (childMoves.length) {
      add(nextEl, h('h3', {}, childMoves.length === 1 ? 'Nächster Zug' : `Nächste Züge (${childMoves.length})`));
      for (const child of childMoves) {
        const lines = linesThrough(study, child);
        add(
          nextEl,
          h(
            'div',
            { class: ['next-move', child.color === study.userColor ? 'own' : ''] },
            h(
              'button',
              { class: 'next-move-btn', onclick: () => go(child) },
              h('strong', {}, moveLabel(child)),
              h('span', { class: 'muted small' }, child.color === study.userColor ? 'dein Zug' : 'Gegnerzug'),
              icon('chevronRight', { size: 18 }),
            ),
            h('div', { class: 'var-chips' }, lines.map(chip)),
          ),
        );
      }
    } else {
      const ending = linesThrough(study, node);
      const entry = ending[0] && tileFor(ending[0]);
      add(
        nextEl,
        h('h3', {}, 'Ende der Variante'),
        h('div', { class: 'var-chips' }, ending.map(chip)),
        entry && entry.status !== 'locked'
          ? h('a', { class: 'btn btn-primary', href: tileHref(course, entry.tile) }, icon('book', { size: 16 }), 'Diese Variante lernen')
          : entry
            ? h('p', { class: 'muted small' }, 'Die zugehörige Kachel ist noch gesperrt.')
            : null,
      );
    }

    clear(movesEl);
    const path = [];
    for (let n = node; n.parent; n = n.parent) path.unshift(n);
    if (!path.length) add(movesEl, h('span', { class: 'muted small' }, 'Ausgangsstellung'));
    path.forEach((n, i) => {
      if (n.color === 'w' || i === 0) add(movesEl, h('span', { class: 'move-no' }, `${n.moveNumber}.${n.color === 'b' ? '..' : ''}`));
      add(movesEl, h('button', { class: ['move', n === node ? 'current' : '', n.color === study.userColor ? 'own' : ''], onclick: () => go(n) }, n.san));
    });

    for (const [cmd, btn] of navButtons) btn.disabled = cmd === 'first' || cmd === 'prev' ? !node.parent : !node.children.length;
  }

  const navButtons = [
    ['first', 'first', 'Zum Anfang'],
    ['prev', 'chevronLeft', 'Zurück'],
    ['next', 'chevronRight', 'Vor'],
    ['last', 'last', 'Zum Ende'],
  ].map(([cmd, iconName, label]) => [cmd, h('button', { class: 'nav-btn', 'aria-label': label, title: label, onclick: nav[cmd] }, icon(iconName))]);

  add(
    root,
    h(
      'div',
      { class: 'page explorer-page' },
      h(
        'div',
        { class: 'page-head' },
        h('a', { class: 'icon-btn back-btn', href: backHref, 'aria-label': 'Zurück zum Pfad' }, icon('arrowLeft')),
        courseIcon(course, { size: 44 }),
        h(
          'div',
          {},
          h('div', { class: 'muted small' }, `${course.name} · Kapitel ${chapter.index + 1}`),
          h('h1', { class: 'h2' }, h('span', { class: 'study-badge' }, `STUDY ${study.index + 1}`), ` ${study.title}`),
        ),
      ),
      h(
        'div',
        { class: 'session-main' },
        h('div', { class: 'board-col' }, h('div', { class: 'board-wrap' }, boardEl)),
        h(
          'aside',
          { class: 'session-side' },
          h(
            'div',
            { class: 'board-nav' },
            navButtons.map(([, b]) => b),
          ),
          commentEl,
          nextEl,
          h('div', { class: 'card-sub' }, h('h3', {}, 'Zugfolge'), movesEl),
        ),
      ),
    ),
  );

  const board = createBoard(boardEl, {
    orientation: study.userColor,
    coordinates: settings.showCoordinates,
    onMove: (from, to) => {
      const child = node.children.find((c) => c.from === from && c.to === to);
      if (child) go(child);
      else render();
    },
  });
  render();

  function onKey(e) {
    if (e.key === 'ArrowLeft') nav.prev();
    else if (e.key === 'ArrowRight') nav.next();
    else if (e.key === 'Home') nav.first();
    else if (e.key === 'End') nav.last();
    else if (e.key === 'Escape') location.hash = backHref;
  }
  document.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('keydown', onKey);
    board.destroy();
  };
}
