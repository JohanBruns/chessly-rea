// Gemeinsame Sitzungsansicht für Lern-Kacheln, Drill-Kacheln, Drill Shuffle und Wiederholung:
// Banner „Variante 1 von 2“ mit „…“-Menü und Hinweis, segmentierter Fortschrittsbalken,
// Brett mit Navigation und Kommentarkarte.
import { correctBadge, createBoard, fenAfter, isPromotion, lichessAnalysisUrl, mistakeBadge } from '../board.js';
import { add, clear, fill, h } from '../dom.js';
import { LineSession } from '../lineSession.js';
import { moveLabel } from '../pgnParser.js';
import { gradeCard, isDue, markLearned } from '../scheduler.js';
import { sounds } from '../sound.js';
import { addXp, loadProgress, loadSettings, saveCard } from '../storage.js';
import { TileRun } from '../tileSession.js';
import { icon } from '../ui/icons.js';
import { xpToast } from '../ui/toast.js';

const PHASE_LABEL = { learn: 'Lernen', review: 'Wiederholen', drill: 'Drill' };

/**
 * @param {HTMLElement} root
 * @param {object} cfg
 *   lines, kind ('learn'|'drill'), bannerIcon, title(run) → Bannertext,
 *   grade (true = Spaced-Repetition-Karte bewerten), xpPerVariation,
 *   backHref, backLabel, videoUrl, onFinish(run, earnedXp) → { title, text, actions: [{label, href, primary}] }
 */
export function runSession(root, cfg) {
  const settings = loadSettings();
  const run = new TileRun(cfg.lines, { kind: cfg.kind, retryMistakes: cfg.kind === 'drill' });
  const play = (name) => settings.sound && sounds[name]();
  let session = null;
  let timer = null;
  let state = 'playing'; // playing | wrong | learnDone | variationDone | finished
  let note = null; // { type, text } – Statuszeile in der Kommentarkarte
  let earnedXp = 0;
  let menuOpen = false;
  let flash = [];
  let shownStep = null; // Schritt, der gerade gezeigt wird (bleibt nach dem Abschluss stehen) // kurzzeitige Abzeichen (Häkchen am richtigen Zug)

  // ---------- Layout ----------
  const bannerEl = h('div', { class: 'session-banner' });
  const segmentsEl = h('div', { class: 'segments', role: 'progressbar' });
  const boardEl = h('div', { class: 'board' });
  const navEl = h('div', { class: 'board-nav' });
  const commentEl = h('div', { class: 'comment-card', 'aria-live': 'polite' });
  const actionsEl = h('div', { class: 'session-actions' });

  add(
    root,
    h(
      'div',
      { class: 'session' },
      bannerEl,
      segmentsEl,
      h('div', { class: 'session-main' }, h('div', { class: 'board-col' }, h('div', { class: 'board-wrap' }, boardEl)), h('aside', { class: 'session-side' }, navEl, commentEl, actionsEl)),
    ),
  );

  const board = createBoard(boardEl, {
    orientation: cfg.lines[0]?.userColor || 'w',
    coordinates: settings.showCoordinates,
    onMove: (from, to) => userMove(from, to),
  });

  const NAV = [
    ['first', 'first', 'Zum Anfang'],
    ['prev', 'chevronLeft', 'Zurück'],
    ['next', 'chevronRight', 'Vor'],
    ['last', 'last', 'Zur aktuellen Stellung'],
  ];
  const navButtons = NAV.map(([cmd, iconName, label]) => {
    const btn = h('button', { class: 'nav-btn', 'aria-label': label, title: label, onclick: () => navigate(cmd) }, icon(iconName, { size: 20 }));
    add(navEl, btn);
    return [cmd, btn];
  });

  // ---------- Ablauf ----------
  function startStep() {
    clearTimeout(timer);
    const step = run.current;
    if (!step) {
      finish();
      return;
    }
    shownStep = step;
    session = new LineSession(step.line, { mode: step.phase === 'learn' ? 'learn' : 'drill', hintAfterMistakes: settings.hintAfterMistakes });
    state = 'playing';
    note = null;
    flash = [];
    board.setOrientation(step.line.userColor);
    board.show(step.line.startFen);
    advance();
  }

  function advance() {
    clearTimeout(timer);
    if (session.finished) {
      lineFinished();
      return;
    }
    if (!session.isUserTurn()) {
      render(false);
      timer = setTimeout(
        () => {
          flash = [];
          session.playOpponent();
          play('move');
          advance();
        },
        session.index === 0 ? Math.max(350, settings.opponentDelay) : settings.opponentDelay,
      );
      return;
    }
    render(true);
  }

  function userMove(from, to) {
    if (state !== 'playing' || !session.isUserTurn()) return;
    const expected = session.nextNode;
    const promotion = isPromotion(session.fen, from, to) ? expected.promotion || 'q' : undefined;
    const fenBefore = session.fen;
    const result = session.submit({ from, to, promotion });

    if (result.status === 'correct') {
      play('correct');
      note = null;
      // Häkchen am gezogenen Stein (nur beim Wiederholen), bis der Gegner zieht
      flash = session.mode === 'drill' ? [correctBadge(to)] : [];
      advance();
      return;
    }

    // Falscher Zug: im Lernen still zurücksetzen, beim Wiederholen rotes Abzeichen an der Figur
    play('wrong');
    state = 'wrong';
    const after = fenAfter(fenBefore, from, to, promotion);
    if (result.status === 'alternative') {
      note = { type: 'warn', text: `${moveLabel(result.node)} gehört zu einer anderen Variante – hier ist ein anderer Zug gefragt.` };
    } else if (session.mode === 'drill') {
      note = { type: 'bad', text: session.showsHint() ? 'Nicht ganz – die Lösung ist eingezeichnet.' : 'Nicht ganz – versuch es noch einmal.' };
    }
    board.lock();
    if (session.mode === 'drill' && after) board.show(after.fen, { lastMove: [from, to], shapes: [mistakeBadge(to)] });
    renderSide();
    timer = setTimeout(
      () => {
        state = 'playing';
        render(true);
      },
      session.mode === 'learn' ? 200 : 750,
    );
  }

  function lineFinished() {
    const step = run.current;
    const line = step.line;
    const result = session.result();

    if (step.phase === 'learn') {
      saveCard(line.id, markLearned(loadProgress()[line.id]));
      run.complete(result);
      play('done');
      state = 'learnDone';
      render(false);
      return;
    }

    // Spaced Repetition: fällige oder frisch gelernte Varianten bewerten. Eine fehlerfreie
    // zusätzliche Runde am selben Tag (z. B. Drill-Kachel) verlängert das Intervall nicht.
    const card = loadProgress()[line.id];
    if (cfg.grade && (result.mistakes > 0 || !card || card.status !== 'review' || isDue(card))) saveCard(line.id, gradeCard(card, result));
    const outcome = run.complete(result);
    const xp = outcome.retry ? 0 : cfg.xpPerVariation || 0;
    if (xp) {
      addXp(xp);
      earnedXp += xp;
      xpToast(xp);
    }
    play(result.mistakes ? 'wrong' : 'done');
    state = 'variationDone';
    note = outcome.retry
      ? { type: 'warn', text: `${result.mistakes} Fehler – diese Variante kommt am Ende noch einmal.` }
      : { type: 'good', text: result.mistakes ? `Geschafft – mit ${result.mistakes} Fehler${result.mistakes === 1 ? '' : 'n'}.` : result.hints ? 'Geschafft – mit Hinweis.' : 'Fehlerfrei!' };
    render(false);
    // Drills laufen automatisch weiter
    if (cfg.kind === 'drill') timer = setTimeout(() => startStep(), outcome.retry || result.mistakes ? 1600 : 900);
  }

  function hint() {
    if (state !== 'playing' || session.mode === 'learn' || !session.isUserTurn()) return;
    session.navigate('last');
    session.useHint();
    note = null;
    render(true);
  }

  function navigate(cmd) {
    if (!session || state === 'wrong') return;
    session.navigate(cmd);
    render(state === 'playing' && session.isLive);
  }

  function finish() {
    state = 'finished';
    clearTimeout(timer);
    const result = cfg.onFinish ? cfg.onFinish(run, earnedXp) : null;
    if (result?.xp) earnedXp += result.xp;
    renderBanner();
    renderSegments();
    board.lock();
    const summary = run.summary();
    fill(
      commentEl,
      h(
        'div',
        { class: 'finish-card' },
        h('div', { class: 'finish-icon' }, icon('trophy', { size: 34 })),
        h('h2', {}, result?.title || 'Geschafft!'),
        result?.text ? h('p', {}, result.text) : null,
        h(
          'div',
          { class: 'finish-stats' },
          h('div', {}, h('strong', {}, String(run.variationCount)), h('span', {}, run.variationCount === 1 ? 'Variante' : 'Varianten')),
          h('div', {}, h('strong', {}, String(summary.perfect)), h('span', {}, 'fehlerfrei')),
          h('div', {}, h('strong', {}, `+${earnedXp}`), h('span', {}, 'XP')),
        ),
      ),
    );
    fill(
      actionsEl,
      ...(result?.actions || [{ label: cfg.backLabel || 'Zurück', href: cfg.backHref || '#/', primary: true }]).map((a) =>
        h('a', { class: ['btn', a.primary ? 'btn-primary' : 'btn-ghost', 'btn-block'], href: a.href }, a.label),
      ),
    );
    setTimeout(() => actionsEl.querySelector('a')?.focus(), 0);
    renderNav();
  }

  // ---------- Darstellung ----------
  function render(interactive) {
    const shapes = state === 'learnDone' ? session.summary().shapes : [...session.shapes(), ...(session.isLive ? flash : [])];
    const last = session.shownNode;
    board.show(session.shownFen, {
      lastMove: last ? [last.from, last.to] : undefined,
      interactive: interactive && state === 'playing' && session.isLive && session.isUserTurn(),
      userColor: session.userColor,
      shapes,
    });
    renderBanner();
    renderSegments();
    renderSide();
  }

  function renderBanner() {
    const phase = state === 'finished' ? null : shownStep?.phase;
    const showHint = state === 'playing' && session?.mode === 'drill' && session.isUserTurn();
    const menu = menuOpen
      ? h(
          'div',
          { class: 'popover dots-menu', role: 'menu' },
          h(
            'a',
            { class: 'menu-item', role: 'menuitem', href: lichessAnalysisUrl(session ? session.shownFen : cfg.lines[0].startFen), target: '_blank', rel: 'noopener' },
            icon('search', { size: 18 }),
            'Position analysieren',
          ),
          h('a', { class: 'menu-item', role: 'menuitem', href: cfg.backHref || '#/' }, icon('arrowLeft', { size: 18 }), cfg.backLabel || 'Zurück'),
          cfg.videoUrl ? h('a', { class: 'menu-item', role: 'menuitem', href: cfg.videoUrl, target: '_blank', rel: 'noopener' }, icon('play', { size: 18 }), 'Video ansehen') : null,
        )
      : null;
    fill(
      bannerEl,
      h('div', { class: 'banner-title' }, icon(cfg.bannerIcon || 'book', { size: 26 }), h('span', {}, state === 'finished' ? 'Abgeschlossen' : cfg.title(run, shownStep))),
      phase ? h('span', { class: ['phase-tag', phase] }, PHASE_LABEL[phase]) : null,
      h(
        'div',
        { class: 'banner-actions' },
        showHint
          ? h(
              'button',
              { class: ['btn', 'btn-hint', session.hintStage() >= 1 ? 'solution' : ''], onclick: hint, title: 'Taste H', disabled: session.hintStage() >= 2 },
              icon('bulb', { size: 18 }),
              session.hintButtonLabel(),
            )
          : null,
        h(
          'div',
          { class: 'dots-wrap' },
          h(
            'button',
            {
              class: 'icon-btn dots-btn',
              'aria-label': 'Weitere Aktionen',
              'aria-expanded': String(menuOpen),
              onclick: (e) => {
                e.stopPropagation();
                menuOpen = !menuOpen;
                renderBanner();
              },
            },
            icon('dots', { size: 22 }),
          ),
          menu,
        ),
      ),
    );
  }

  function renderSegments() {
    fill(segmentsEl, ...run.segments().map((s) => h('span', { class: ['segment', s.state, s.phase] }, h('span', { class: 'segment-fill' }))));
    segmentsEl.setAttribute('aria-valuenow', String(run.doneSegments.size));
    segmentsEl.setAttribute('aria-valuemax', String(run.segmentCount));
  }

  function renderNav() {
    for (const [cmd, btn] of navButtons) btn.disabled = !session || state === 'finished' || !session.canNavigate(cmd);
  }

  function renderSide() {
    renderNav();
    if (state === 'finished') return;
    clear(commentEl);
    clear(actionsEl);
    const step = shownStep;

    if (state === 'learnDone') {
      const summary = session.summary();
      add(
        commentEl,
        h('div', { class: 'complete-head' }, icon('check', { size: 22, strokeWidth: 3 }), h('strong', {}, 'Variante abgeschlossen!')),
        summary.text ? h('p', {}, summary.text) : h('p', { class: 'muted' }, 'Gleich spielst du sie aus dem Gedächtnis.'),
      );
      add(
        actionsEl,
        h(
          'button',
          {
            class: 'btn btn-ghost',
            onclick: () => {
              run.redo();
              startStep();
            },
          },
          icon('undo', { size: 18 }),
          'Nochmal',
        ),
        h('button', { class: 'btn btn-primary', onclick: () => startStep(), title: 'Enter' }, 'Weiter zur Wiederholung', icon('chevronRight', { size: 18 })),
      );
      setTimeout(() => actionsEl.querySelector('.btn-primary')?.focus(), 0);
      return;
    }

    if (state === 'variationDone') {
      add(
        commentEl,
        h(
          'div',
          { class: ['complete-head', note?.type === 'warn' ? 'warn' : ''] },
          icon(note?.type === 'warn' ? 'repeat' : 'check', { size: 22, strokeWidth: 3 }),
          h('strong', {}, cfg.kind === 'learn' ? 'Variante gemeistert!' : step.line.name),
        ),
        note ? h('p', {}, note.text) : null,
      );
      const summary = session.summary();
      if (cfg.kind === 'learn' && summary.text) add(commentEl, h('p', { class: 'muted' }, summary.text));
      add(actionsEl, h('button', { class: 'btn btn-primary btn-block', onclick: () => startStep(), title: 'Enter' }, run.finished ? 'Abschließen' : 'Weiter', icon('chevronRight', { size: 18 })));
      if (cfg.kind === 'learn') setTimeout(() => actionsEl.querySelector('.btn-primary')?.focus(), 0);
      return;
    }

    // Während der Linie
    const entries = session.isLive ? session.explanation() : [];
    if (!session.isLive) {
      add(commentEl, h('p', { class: 'muted' }, 'Du siehst eine frühere Stellung. ', h('button', { class: 'link-btn', onclick: () => navigate('last') }, 'Zur aktuellen Stellung')));
    } else if (entries.length) {
      for (const entry of entries)
        add(
          commentEl,
          h('div', { class: ['comment', entry.own ? 'own' : '', entry.hint && session.mode === 'drill' ? 'hint' : ''] }, h('div', { class: 'comment-label' }, entry.label), h('p', {}, entry.text)),
        );
    } else if (session.isUserTurn()) {
      const color = session.userColor === 'w' ? 'Weiß' : 'Schwarz';
      add(commentEl, h('p', { class: 'prompt' }, session.mode === 'learn' ? 'Spiele den markierten Zug.' : `Dein Zug als ${color} – aus dem Gedächtnis.`));
    } else {
      add(commentEl, h('p', { class: 'muted' }, 'Gegner ist am Zug …'));
    }
    if (note) add(commentEl, h('div', { class: ['note', note.type] }, note.text));
    commentEl.classList.toggle('drill', session.mode === 'drill');
    add(actionsEl, h('div', { class: 'line-caption muted small' }, step.line.studyTitle ? `${step.line.studyTitle} · ${step.line.name}` : step.line.name));
  }

  function onKey(e) {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowLeft') navigate('prev');
    else if (e.key === 'ArrowRight') navigate('next');
    else if (e.key === 'Home') navigate('first');
    else if (e.key === 'End') navigate('last');
    else if (e.key === 'h' || e.key === 'H') hint();
    else if (e.key === 'Enter' && (state === 'learnDone' || state === 'variationDone')) {
      e.preventDefault();
      startStep();
    } else if (e.key === 'Escape') {
      if (menuOpen) {
        menuOpen = false;
        renderBanner();
      } else location.hash = cfg.backHref || '#/';
    } else return;
  }
  function onDocClick(e) {
    if (menuOpen && !e.target.closest('.dots-wrap')) {
      menuOpen = false;
      renderBanner();
    }
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', onDocClick);

  // Nur im Dev-Modus: Testhilfe, die den erwarteten Zug über denselben Weg wie ein Klick spielt
  if (import.meta.env.DEV) {
    window.__reaSession = {
      playExpected: () => session?.isUserTurn() && userMove(session.nextNode.from, session.nextNode.to),
      state: () => ({ state, step: run.current && { phase: run.current.phase, line: run.current.line.name }, userTurn: !!session?.isUserTurn() }),
    };
  }

  startStep();

  return () => {
    if (import.meta.env.DEV) delete window.__reaSession;
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onDocClick);
    board.destroy();
  };
}
