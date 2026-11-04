// Gegen den Bot: Der Bot spielt Züge aus dem Repertoire des Kurses, danach übernimmt Stockfish.
// Abweichungen vom eigenen Repertoire werden angezeigt und können zurückgenommen werden.
import { Chess } from 'chess.js';
import { createBoard, isPromotion, lichessAnalysisUrl } from '../board.js';
import { bookMoves, engineParams, judgeMove, pickBookMove } from '../bot.js';
import { buildPositionIndex } from '../courseLoader.js';
import { findCourse, loadAllCourses } from '../courses.js';
import { add, clear, h } from '../dom.js';
import { Engine } from '../engine.js';
import { sounds } from '../sound.js';
import { loadSettings, saveSettings } from '../storage.js';
import { courseIcon } from '../ui/courseIcon.js';
import { icon } from '../ui/icons.js';
import { setSessionHeader } from '../ui/layout.js';

function picker(root) {
  add(
    root,
    h(
      'div',
      { class: 'page' },
      h(
        'div',
        { class: 'page-head' },
        h('div', { class: 'page-icon' }, icon('bot', { size: 28 })),
        h('div', {}, h('h1', {}, 'Gegen den Bot'), h('p', { class: 'muted' }, 'Der Bot spielt die Züge aus deinem Kurs – sobald das Repertoire endet, übernimmt Stockfish.')),
      ),
      h(
        'div',
        { class: 'pick-grid' },
        // Video-Kurse haben keine Züge, gegen die der Bot spielen könnte
        loadAllCourses().courses.filter((course) => !course.videoOnly).map((course) =>
          h(
            'a',
            { class: 'card pick-card', href: `#/bot?course=${encodeURIComponent(course.id)}` },
            courseIcon(course, { size: 52 }),
            h(
              'div',
              { class: 'pick-info' },
              h('strong', {}, course.name),
              h('span', { class: 'muted small' }, course.color === 'b' ? 'Du spielst Schwarz' : course.color === 'w' ? 'Du spielst Weiß' : 'Beide Farben'),
            ),
            icon('chevronRight', { size: 20, cls: 'muted' }),
          ),
        ),
      ),
    ),
  );
  return null;
}

export function renderBot(root, params) {
  const course = params.course ? findCourse(params.course) : null;
  if (!course) return picker(root);

  const settings = loadSettings();
  const index = buildPositionIndex(course);
  const engine = new Engine();
  const startFen = course.studies[0]?.root.fen || new Chess().fen();
  let userColor = params.color === 'w' || params.color === 'b' ? params.color : course.color === 'b' ? 'b' : 'w';
  let chess = new Chess(startFen);
  let inBook = true;
  let note = null;
  let thinking = false;
  let timer = null;
  let engineError = null;
  let gameId = 0;
  const play = (name) => settings.sound && sounds[name]();

  const boardEl = h('div', { class: 'board' });
  const statusEl = h('div', { class: 'comment-card' });
  const movesEl = h('div', { class: 'explorer-moves' });
  const skillLabel = h('strong', {}, String(settings.engineSkill));
  const skillInput = h('input', {
    type: 'range',
    min: 0,
    max: 20,
    value: settings.engineSkill,
    class: 'range',
    'aria-label': 'Spielstärke',
    oninput: (e) => {
      settings.engineSkill = Number(e.target.value);
      skillLabel.textContent = String(settings.engineSkill);
      saveSettings({ ...loadSettings(), engineSkill: settings.engineSkill });
    },
  });

  setSessionHeader(
    h(
      'a',
      { class: 'session-head', href: `#/course/${encodeURIComponent(course.id)}` },
      courseIcon(course, { size: 42 }),
      h('div', {}, h('div', { class: 'session-course' }, 'Gegen den Bot'), h('div', { class: 'session-chapter muted' }, course.name)),
    ),
  );

  add(
    root,
    h(
      'div',
      { class: 'session' },
      h('div', { class: 'session-banner' }, h('div', { class: 'banner-title' }, icon('bot', { size: 26 }), h('span', {}, `Du spielst ${userColor === 'w' ? 'Weiß' : 'Schwarz'}`))),
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
            h('button', { class: 'nav-btn', title: 'Zug zurücknehmen', 'aria-label': 'Zug zurücknehmen', onclick: () => takeBack() }, icon('undo')),
            h('button', { class: 'nav-btn', title: 'Neue Partie', 'aria-label': 'Neue Partie', onclick: () => newGame() }, icon('repeat')),
            h('button', { class: 'nav-btn', title: 'Farbe wechseln', 'aria-label': 'Farbe wechseln', onclick: () => ((userColor = userColor === 'w' ? 'b' : 'w'), newGame()) }, icon('flip')),
            h(
              'a',
              {
                class: 'nav-btn',
                title: 'Auf Lichess analysieren',
                'aria-label': 'Auf Lichess analysieren',
                target: '_blank',
                rel: 'noopener',
                onclick: (e) => (e.currentTarget.href = lichessAnalysisUrl(chess.fen())),
                href: '#',
              },
              icon('search'),
            ),
          ),
          statusEl,
          h('div', { class: 'card-sub' }, h('h3', {}, 'Züge'), movesEl),
          h('label', { class: 'skill-row' }, h('span', {}, 'Stockfish-Stärke ', skillLabel, h('span', { class: 'muted' }, ' / 20')), skillInput),
        ),
      ),
    ),
  );

  const board = createBoard(boardEl, { orientation: userColor, coordinates: settings.showCoordinates, onMove: (from, to) => userMove(from, to) });

  function lastMove() {
    const hist = chess.history({ verbose: true });
    const m = hist[hist.length - 1];
    return m ? [m.from, m.to] : undefined;
  }

  function gameOverText() {
    if (chess.isCheckmate()) return chess.turn() === userColor ? 'Schachmatt – der Bot gewinnt.' : 'Schachmatt – du gewinnst!';
    if (chess.isStalemate()) return 'Patt – Remis.';
    if (chess.isDraw()) return 'Remis.';
    return null;
  }

  function render() {
    const over = gameOverText();
    board.setOrientation(userColor);
    board.show(chess.fen(), { lastMove: lastMove(), interactive: !over && !thinking && chess.turn() === userColor, userColor });

    clear(statusEl);
    const book = bookMoves(index, chess.fen());
    if (over) add(statusEl, h('div', { class: 'complete-head' }, icon('trophy', { size: 22 }), h('strong', {}, over)));
    else if (inBook) add(statusEl, h('div', { class: 'status-pill book' }, icon('book', { size: 16 }), 'Im Repertoire'));
    else add(statusEl, h('div', { class: 'status-pill engine' }, icon('bot', { size: 16 }), 'Repertoire verlassen – Stockfish spielt'));
    if (note) add(statusEl, h('div', { class: ['note', note.type] }, note.text, note.undo ? h('button', { class: 'link-btn', onclick: () => takeBack() }, ' Zurücknehmen') : null));
    if (!over && thinking) add(statusEl, h('p', { class: 'muted' }, 'Bot denkt nach …'));
    else if (!over && chess.turn() === userColor && book.length && inBook) add(statusEl, h('p', { class: 'muted small' }, 'Spiele deinen Repertoire-Zug.'));
    if (engineError) add(statusEl, h('div', { class: 'note warn' }, engineError));

    clear(movesEl);
    const hist = chess.history({ verbose: true });
    if (!hist.length) add(movesEl, h('span', { class: 'muted small' }, userColor === 'w' ? 'Du beginnst.' : 'Der Bot beginnt.'));
    hist.forEach((m, i) => {
      if (m.color === 'w' || i === 0) add(movesEl, h('span', { class: 'move-no' }, `${Math.floor(i / 2) + 1}.${m.color === 'b' ? '..' : ''}`));
      add(movesEl, h('span', { class: ['move', m.color === userColor ? 'own' : '', i === hist.length - 1 ? 'current' : ''] }, m.san));
    });
  }

  function userMove(from, to) {
    if (thinking || chess.turn() !== userColor) return;
    const fenBefore = chess.fen();
    let move;
    try {
      move = chess.move({ from, to, promotion: isPromotion(fenBefore, from, to) ? 'q' : undefined });
    } catch {
      render();
      return;
    }
    play('move');
    const { verdict, expected } = judgeMove(index, fenBefore, move.from + move.to + (move.promotion || ''));
    if (verdict === 'deviation') {
      inBook = false;
      note = { type: 'warn', text: `Abweichung vom Repertoire – vorgesehen ist ${expected.map((m) => m.san).join(' oder ')}.`, undo: true };
    } else {
      note = null;
      if (verdict === 'outOfBook') inBook = false;
    }
    botTurn();
  }

  function botTurn() {
    if (gameOverText() || chess.turn() === userColor) {
      render();
      return;
    }
    thinking = true;
    render();
    const id = gameId;
    const book = inBook ? bookMoves(index, chess.fen()) : [];
    timer = setTimeout(async () => {
      let uci = null;
      if (book.length) uci = pickBookMove(book).uci;
      else {
        inBook = false;
        try {
          const p = engineParams(settings.engineSkill);
          await engine.setSkill(p.skill);
          uci = await engine.bestMove(chess.fen(), p);
        } catch (err) {
          engineError = `Stockfish nicht verfügbar (${err.message}) – der Bot zieht zufällig.`;
          const legal = chess.moves({ verbose: true });
          const m = legal[Math.floor(Math.random() * legal.length)];
          uci = m ? m.from + m.to + (m.promotion || '') : null;
        }
      }
      if (id !== gameId) return;
      thinking = false;
      if (uci) {
        chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        play('move');
      }
      render();
    }, settings.opponentDelay);
  }

  function takeBack() {
    clearTimeout(timer);
    gameId++;
    thinking = false;
    engine.stop();
    // Bis zum letzten eigenen Zug zurück
    if (chess.history().length && chess.turn() === userColor) chess.undo();
    if (chess.history().length) chess.undo();
    inBook = bookMoves(index, chess.fen()).length > 0 || chess.history().length === 0;
    note = null;
    if (chess.turn() !== userColor) botTurn();
    else render();
  }

  function newGame() {
    clearTimeout(timer);
    gameId++;
    thinking = false;
    engine.stop();
    chess = new Chess(startFen);
    inBook = true;
    note = null;
    root.querySelector('.banner-title span').textContent = `Du spielst ${userColor === 'w' ? 'Weiß' : 'Schwarz'}`;
    botTurn();
  }

  newGame();

  return () => {
    clearTimeout(timer);
    gameId++;
    engine.destroy();
    board.destroy();
  };
}
