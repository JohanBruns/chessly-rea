import { describe, expect, it } from 'vitest';
import { gradeCard, markLearned, isDue, isNew, isMastered, newCard } from '../src/scheduler.js';

const NOW = new Date(2026, 9, 20, 15, 0, 0).getTime();

describe('scheduler', () => {
  it('neue Karten sind weder fällig noch gelernt', () => {
    expect(isNew(undefined)).toBe(true);
    expect(isDue(newCard(), NOW)).toBe(false);
  });

  it('nach dem Lernen ist die Linie sofort fällig', () => {
    const card = markLearned(undefined, NOW);
    expect(card.status).toBe('learning');
    expect(isDue(card, NOW)).toBe(true);
  });

  it('fehlerfreie Wiederholung plant für den nächsten Tag', () => {
    const card = gradeCard(markLearned(undefined, NOW), { mistakes: 0 }, NOW);
    expect(card.status).toBe('review');
    expect(card.interval).toBe(1);
    // fällig ab Mitternacht des Folgetags (NOW ist 15:00 Uhr)
    expect(isDue(card, NOW + 8 * 60 * 60 * 1000)).toBe(false);
    expect(isDue(card, NOW + 9 * 60 * 60 * 1000)).toBe(true);
  });

  it('Intervalle wachsen mit der Leichtigkeit', () => {
    let card = gradeCard(undefined, {}, NOW);
    const intervals = [card.interval];
    for (let i = 0; i < 4; i++) {
      card = gradeCard(card, {}, card.due);
      intervals.push(card.interval);
    }
    expect(intervals[0]).toBe(1);
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });

  it('Fehler setzen die Linie zurück und senken die Leichtigkeit', () => {
    let card = gradeCard(undefined, {}, NOW);
    card = gradeCard(card, {}, card.due);
    const failed = gradeCard(card, { mistakes: 2 }, NOW);
    expect(failed.status).toBe('learning');
    expect(failed.interval).toBe(0);
    expect(failed.lapses).toBe(1);
    expect(failed.ease).toBeLessThan(card.ease);
    expect(isDue(failed, NOW + 10 * 60 * 1000)).toBe(true);
  });

  it('Hinweise verkürzen das Intervall', () => {
    let card = gradeCard(undefined, {}, NOW);
    for (let i = 0; i < 3; i++) card = gradeCard(card, {}, card.due);
    const clean = gradeCard(card, {}, card.due);
    const hinted = gradeCard(card, { hints: 1 }, card.due);
    expect(hinted.interval).toBeLessThan(clean.interval);
  });

  it('erkennt sicher gelernte Linien', () => {
    expect(isMastered({ status: 'review', interval: 30 })).toBe(true);
    expect(isMastered({ status: 'review', interval: 5 })).toBe(false);
  });
});
