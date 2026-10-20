// Trainingsansicht: Brett + Seitenleiste, arbeitet eine Warteschlange von Linien ab
// (Lernen → direkt danach Drillen, Wiederholungen, freies Üben).
import { createBoard, isPromotion } from '../board.js';
import { buildQueue, findCourse, findLine, loadAllCourses } from '../courses.js';
import { h, clear, formatDue, colorLabel } from '../dom.js';
import { LineSession } from '../lineSession.js';
import { moveLabel } from '../pgnParser.js';
import { gradeCard, markLearned } from '../scheduler.js';
import { sounds } from '../sound.js';
import { loadProgress, loadSettings, saveCard } from '../storage.js';

const KIND_LABEL = {
  learn: 'Neue Linien lernen',
  review: 'Wiederholung',
  practice: 'Freies Üben',
  line: 'Einzelne Linie',
};

function resolveLines(params) {
  if (params.line) {
    const line = findLine(params.line);
    return line ? [line] : [];
  }
  if (params.course) {
    const course = findCourse(params.course);
    if (!course) return [];
    if (params.chapter) return course.chapters.find((c) => c.id === params.chapter)?.lines || [];
    return course.lines;
  }
  return loadAllCourses().courses.flatMap((c) => c.lines);
}

function backHref(params) {
  return params.course ? `#/course/${encodeURIComponent(params.course)}` : '#/';
}

export function renderTrainer(root, params) {
  const settings = loadSettings();
  const kind = params.kind || 'review';
  const lines = resolveLines(params);
  let queue;
  if (params.line && lines.length) {
    queue = [{ line: lines[0], mode: params.mode === 'learn' ? 'learn' : 'drill', single: true }];
  } else {
    queue = buildQueue(lines, kind, loadProgress(), { newLinesPerSession: settings.newLinesPerSession });
  }

  if (!queue.length) {
    root.append(
      h(
        'div',
        { class: 'empty-state card' },
        h('h2', {}, kind === 'review' ? 'Keine Wiederholungen fällig 🎉' : 'Keine neuen Linien mehr'),
        h('p', {}, kind === 'review' ? 'Komm später wieder – oder lerne neue Linien bzw. übe frei.' : 'Du hast alle Linien dieser Auswahl schon gelernt. Wiederhole sie oder übe frei.'),
        h('a', { class: 'btn', href: backHref(params) }, 'Zurück'),
      ),
    );
    return () => {};
  }

  const totalLines = new Set(queue.map((q) => q.line.id)).size;
  const stats = { finished: 0, perfect: 0, withMistakes: 0 };
  const finishedIds = new Set();
  let item = null;
  let session = null;
  let timer = null;
  let feedback = null;
  let awaitingNext = false;

  // ---------- Layout ----------
  const boardEl = h('div', { class: 'board' });
  const headerEl = h('div', { class: 'trainer-header' });
  const feedbackEl = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const explainEl = h('div', { class: 'explanations' });
  const movesEl = h('div', { class: 'move-list' });
  const actionsEl = h('div', { class: 'trainer-actions' });

  const hintBtn = h('button', { class: 'btn btn-ghost', onclick: () => hint(), title: 'Taste H' }, '💡 Hinweis');
  const restartBtn = h('button', { class: 'btn btn-ghost', onclick: () => restart(), title: 'Taste R' }, '↺ Neu starten');
  const nextBtn = h('button', { class: 'btn btn-primary', onclick: () => next(), title: 'Enter' }, 'Weiter →');

  root.append(
    h(
      'div',
      { class: 'trainer' },
      h('div', { class: 'board-col' }, h('div', { class: 'board-wrap' }, boardEl)),
      h(
        'aside',
        { class: 'panel' },
        headerEl,
        feedbackEl,
        explainEl,
        movesEl,
        actionsEl,
        h('div', { class: 'trainer-footer' }, h('a', { class: 'link-muted', href: backHref(params) }, '✕ Training beenden'), h('span', { class: 'kbd-help' }, 'H Hinweis · R Neustart · Enter Weiter')),
      ),
    ),
  );

  const board = createBoard(boardEl, {
    orientation: queue[0].line.userColor,
    coordinates: settings.showCoordinates,
    onMove: (from, to) => userMove(from, to),
  });

  const play = (name) => settings.sound && sounds[name]();

  // ---------- Ablauf ----------
  function startItem(nextItem) {
    item = nextItem;
    const prev = session;
    session = new LineSession(item.line, { mode: item.mode, hintAfterMistakes: settings.hintAfterMistakes });
    if (item.restartOf && prev) {
      session.mistakes = prev.mistakes;
      session.hints = prev.hints;
    }
    feedback = item.mode === 'learn' ? { type: 'info', text: 'Lernmodus: Spiele die grün markierten Züge nach und lies die Erklärungen.' } : { type: 'info', text: `Spiele die Linie aus dem Gedächtnis – du hast ${colorLabel(item.line.userColor)}.` };
    awaitingNext = false;
    board.setOrientation(item.line.userColor);
    board.show(session.line.startFen, { lastMove: undefined });
    step();
  }

  function step() {
    clearTimeout(timer);
    if (session.finished) {
      lineFinished();
      return;
    }
    if (!session.isUserTurn()) {
      render(false);
      timer = setTimeout(() => {
        const node = session.playOpponent();
        play('move');
        board.show(node.fen, { lastMove: [node.from, node.to] });
        step();
      }, settings.opponentDelay);
      return;
    }
    render(true);
  }

  function userMove(from, to) {
    if (awaitingNext || !session.isUserTurn()) return;
    const expected = session.nextNode;
    const promotion = isPromotion(session.fen, from, to) ? expected.promotion || 'q' : undefined;
    const result = session.submit({ from, to, promotion });

    if (result.status === 'correct') {
      play('correct');
      board.show(result.node.fen, { lastMove: [result.node.from, result.node.to] });
      feedback = { type: 'good', text: `✓ ${moveLabel(result.node)} – richtig!` };
      step();
      return;
    }

    play('wrong');
    if (result.status === 'alternative') {
      feedback = { type: 'warn', text: `${moveLabel(result.node)} steht auch in deinem Repertoire – aber in einer anderen Linie. Hier ist ein anderer Zug gefragt.` };
    } else {
      feedback = { type: 'bad', text: session.showsHint() ? `✗ Nicht ganz. Der richtige Zug ist markiert: ${moveLabel(expected)}` : '✗ Nicht ganz – versuch es noch einmal.' };
    }
    // Falschen Zug kurz stehen lassen, dann zurücknehmen
    board.lock();
    renderPanel();
    timer = setTimeout(() => {
      const last = session.lastNode;
      board.show(session.fen, { lastMove: last ? [last.from, last.to] : undefined });
      render(true);
    }, 350);
  }

  function lineFinished() {
    awaitingNext = true;
    const line = item.line;
    const { mistakes, hints } = session.result();

    if (item.mode === 'learn') {
      saveCard(line.id, markLearned(loadProgress()[line.id]));
      play('done');
      feedback = { type: 'good', text: '📘 Linie gelernt! Jetzt spielst du sie einmal aus dem Gedächtnis.' };
      queue.unshift({ line, mode: 'drill', single: item.single });
    } else {
      let text;
      if (item.practice) {
        text = mistakes ? `${mistakes} Fehler – weiter üben!` : 'Fehlerfrei! 🎯';
      } else {
        const card = gradeCard(loadProgress()[line.id], { mistakes, hints });
        saveCard(line.id, card);
        text = mistakes ? `${mistakes} Fehler – die Linie kommt gleich noch einmal.` : `Fehlerfrei${hints ? ' (mit Hinweis)' : ''}! Nächste Wiederholung ${formatDue(card)}.`;
        if (mistakes && (item.retry || 0) < 2 && !item.single) queue.push({ ...item, retry: (item.retry || 0) + 1 });
      }
      if (!finishedIds.has(line.id)) {
        finishedIds.add(line.id);
        stats.finished++;
        if (mistakes) stats.withMistakes++;
        else stats.perfect++;
      }
      play(mistakes ? 'wrong' : 'done');
      feedback = { type: mistakes ? 'warn' : 'good', text };
    }
    render(false);
  }

  function next() {
    if (!awaitingNext) return;
    const nextItem = queue.shift();
    if (nextItem) startItem(nextItem);
    else showSummary();
  }

  function hint() {
    if (awaitingNext || !session.isUserTurn()) return;
    const node = session.useHint();
    feedback = { type: 'info', text: `💡 Gesucht ist ${moveLabel(node)}.` };
    render(true);
  }

  function restart() {
    if (!item) return;
    if (awaitingNext) {
      // Nach dem Abschluss nur im Lernmodus erlaubt: die eingereihte Drill-Runde wieder entfernen
      if (item.mode !== 'learn') return;
      if (queue[0] && queue[0].line === item.line && queue[0].mode === 'drill') queue.shift();
      startItem({ ...item });
      return;
    }
    startItem({ ...item, restartOf: true });
  }

  // ---------- Darstellung ----------
  function render(interactive) {
    renderPanel();
    const last = session.lastNode;
    board.show(session.fen, {
      lastMove: last ? [last.from, last.to] : undefined,
      interactive: interactive && session.isUserTurn(),
      userColor: item.line.userColor,
      shapes: session.shapes(),
    });
  }

  function renderPanel() {
    const line = item.line;
    const course = findCourse(line.courseId);

    clear(headerEl).append(
      h('div', { class: 'trainer-kind' }, KIND_LABEL[item.single ? 'line' : kind], h('span', { class: ['mode-badge', item.mode] }, item.mode === 'learn' ? 'Lernen' : 'Drillen')),
      h('div', { class: 'trainer-title' }, line.name),
      h('div', { class: 'trainer-sub' }, `${course ? course.name + ' · ' : ''}${line.chapterTitle}`),
    );
    if (!item.single) {
      headerEl.append(h('div', { class: 'session-progress' }, h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: { width: `${Math.round((stats.finished / totalLines) * 100)}%` } })), h('span', {}, `${stats.finished} / ${totalLines} geschafft`)));
    }

    clear(feedbackEl);
    if (feedback) feedbackEl.append(h('div', { class: ['feedback-msg', feedback.type] }, feedback.text));

    clear(explainEl);
    for (const entry of session.explanation()) {
      explainEl.append(h('div', { class: ['explain', entry.own ? 'own' : ''] }, h('div', { class: 'explain-label' }, entry.label), h('div', {}, entry.text)));
    }

    renderMoves();

    clear(actionsEl);
    if (awaitingNext) {
      actionsEl.append(nextBtn);
      if (item.mode === 'learn') actionsEl.append(restartBtn);
      nextBtn.textContent = queue.length ? 'Weiter →' : 'Abschließen →';
      setTimeout(() => nextBtn.focus(), 0);
    } else {
      hintBtn.disabled = !session.isUserTurn() || item.mode === 'learn';
      actionsEl.append(hintBtn, restartBtn);
    }
  }

  function renderMoves() {
    clear(movesEl);
    const played = session.line.moves.slice(0, session.index);
    if (!played.length) {
      movesEl.append(h('span', { class: 'muted' }, 'Noch keine Züge'));
      return;
    }
    played.forEach((node, i) => {
      if (node.color === 'w' || i === 0) movesEl.append(h('span', { class: 'move-no' }, `${node.moveNumber}.${node.color === 'b' ? '..' : ''}`));
      movesEl.append(h('span', { class: ['move', i === played.length - 1 ? 'current' : '', node.color === session.userColor ? 'own' : ''] }, node.san));
    });
  }

  function showSummary() {
    clearTimeout(timer);
    board.destroy();
    clear(root).append(
      h(
        'div',
        { class: 'summary card' },
        h('h2', {}, 'Training abgeschlossen ✅'),
        h(
          'div',
          { class: 'summary-stats' },
          h('div', {}, h('strong', {}, String(stats.finished)), h('span', {}, 'Linien')),
          h('div', {}, h('strong', {}, String(stats.perfect)), h('span', {}, 'fehlerfrei')),
          h('div', {}, h('strong', {}, String(stats.withMistakes)), h('span', {}, 'mit Fehlern')),
        ),
        h('div', { class: 'row' }, h('a', { class: 'btn btn-primary', href: backHref(params) }, 'Zurück zum Kurs'), h('a', { class: 'btn', href: '#/' }, 'Startseite')),
      ),
    );
  }

  function onKey(e) {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      if (awaitingNext) {
        e.preventDefault();
        next();
      }
    } else if (e.key === 'h' || e.key === 'H') hint();
    else if (e.key === 'r' || e.key === 'R') restart();
    else if (e.key === 'Escape') location.hash = backHref(params);
  }
  document.addEventListener('keydown', onKey);

  startItem(queue.shift());

  return () => {
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey);
    board.destroy();
  };
}
