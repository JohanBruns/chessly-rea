// Spaced Repetition (vereinfachtes SM-2, tagesbasiert wie Anki).
// Eine "Karte" ist der Lernstand einer Linie.

export const DAY_MS = 24 * 60 * 60 * 1000;
const RELEARN_DELAY_MS = 5 * 60 * 1000;
const START_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;

export function newCard() {
  return { status: 'new', due: 0, interval: 0, ease: START_EASE, reps: 0, lapses: 0, lastReviewed: 0 };
}

// Mitternacht (lokale Zeit) in `days` Tagen ab `now`
function startOfDayPlus(now, days) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/**
 * Bewertet eine abgeschlossene Wiederholung.
 * @param {object} card   bisheriger Stand (oder undefined für neue Linien)
 * @param {object} result { mistakes: Anzahl Fehler, hints: Anzahl genutzter Hinweise }
 * @param {number} now    Zeitstempel in ms
 */
export function gradeCard(card, { mistakes = 0, hints = 0 } = {}, now = Date.now()) {
  const prev = { ...newCard(), ...card };
  const next = { ...prev, reps: prev.reps + 1, lastReviewed: now };

  if (mistakes > 0) {
    if (prev.status === 'review') next.lapses = prev.lapses + 1;
    next.status = 'learning';
    next.ease = Math.max(MIN_EASE, prev.ease - 0.2);
    next.interval = 0;
    next.due = now + RELEARN_DELAY_MS;
    return next;
  }

  let interval;
  if (prev.status !== 'review' || prev.interval < 1) {
    interval = 1;
  } else {
    interval = Math.max(prev.interval + 1, Math.round(prev.interval * prev.ease));
  }
  // Mit Hinweis gelöst: kürzer wiederholen, Leichtigkeit sinkt etwas
  if (hints > 0) {
    interval = Math.max(1, Math.round(interval / 2));
    next.ease = Math.max(MIN_EASE, prev.ease - 0.1);
  } else {
    next.ease = Math.min(MAX_EASE, prev.ease + 0.05);
  }
  next.status = 'review';
  next.interval = interval;
  next.due = startOfDayPlus(now, interval);
  return next;
}

// Nach dem ersten Durchlauf im Lernmodus: Linie ist bekannt und sofort fällig.
export function markLearned(card, now = Date.now()) {
  const prev = { ...newCard(), ...card };
  if (prev.status !== 'new') return prev;
  return { ...prev, status: 'learning', due: now, lastReviewed: now };
}

export function isDue(card, now = Date.now()) {
  return !!card && card.status !== 'new' && card.due <= now;
}

export function isNew(card) {
  return !card || card.status === 'new';
}

// Gilt als "sicher gelernt", wenn das Intervall mindestens drei Wochen beträgt.
export function isMastered(card) {
  return !!card && card.status === 'review' && card.interval >= 21;
}
