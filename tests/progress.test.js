import { describe, expect, it } from 'vitest';
import { buildCourse } from '../src/courseLoader.js';
import {
  courseProgress,
  findTile,
  isLineDone,
  LEAGUES,
  levelInfo,
  levelStart,
  nextTile,
  streakInfo,
  tileStates,
  weeklyLeague,
  xpLastDays,
} from '../src/progress.js';
import { dayKey } from '../src/storage.js';

const PGN = `[Course "Testkurs"]
[Chapter "Kapitel A"]
[Study "Study A1"]
[Video "https://example.com/video"]
[Orientation "black"]

1. e4 c6 2. d4 (2. Nc3 d5) 2... d5 3. e5 (3. exd5 cxd5) 3... Bf5 *

[Chapter "Kapitel B"]
[Study "Study B1"]
[Orientation "white"]

1. d4 d5 2. Bf4 *`;

const course = buildCourse({ pgn: PGN });
const [a1, b1] = course.studies;
const emptyState = () => ({ drills: {}, videos: {}, lastCourse: null, started: {} });
const done = { status: 'review', reps: 1 };

// Dienstag, 20.10.2026, 12 Uhr (lokale Zeit) – Montag ist der 19.
const NOW = new Date(2026, 9, 20, 12).getTime();
const day = (offset) => dayKey(new Date(2026, 9, 20 + offset, 12).getTime());

describe('isLineDone', () => {
  it('verlangt mindestens eine Wiederholung', () => {
    expect(isLineDone(undefined)).toBe(false);
    expect(isLineDone({ status: 'learning', reps: 0 })).toBe(false);
    expect(isLineDone(done)).toBe(true);
  });
});

describe('tileStates', () => {
  it('schaltet nur die erste Lern-Kachel frei, Video ist immer offen', () => {
    const states = tileStates(a1, {}, emptyState());
    expect(states.map((s) => [s.tile.type, s.status])).toEqual([
      ['video', 'available'],
      ['learn', 'available'],
      ['learn', 'locked'],
      ['drill', 'locked'],
    ]);
  });

  it('schaltet die nächste Kachel frei, sobald alle Varianten einer Kachel fertig sind', () => {
    const [first] = a1.tiles.filter((t) => t.type === 'learn');
    const progress = { [first.lines[0].id]: done };
    expect(tileStates(a1, progress, emptyState())[2].status).toBe('locked');
    progress[first.lines[1].id] = done;
    const states = tileStates(a1, progress, emptyState());
    expect(states[1].status).toBe('completed');
    expect(states[2].status).toBe('available');
    expect(states[3].status).toBe('locked');
  });

  it('markiert Video- und Drill-Kacheln über den Pfad-Status', () => {
    const progress = Object.fromEntries(a1.lines.map((l) => [l.id, done]));
    const state = { ...emptyState(), videos: { [a1.id]: 1 }, drills: { [a1.id]: 1 } };
    expect(tileStates(a1, progress, state).every((s) => s.status === 'completed')).toBe(true);
    expect(tileStates(a1, progress, emptyState()).at(-1).status).toBe('available');
  });
});

describe('courseProgress / nextTile / findTile', () => {
  it('zählt Kacheln ohne Videos', () => {
    expect(courseProgress(course, {}, emptyState())).toEqual({ total: 5, done: 0, percent: 0 });
    const progress = Object.fromEntries(a1.lines.map((l) => [l.id, done]));
    const state = { ...emptyState(), drills: { [a1.id]: 1 } };
    expect(courseProgress(course, progress, state)).toEqual({ total: 5, done: 3, percent: 60 });
  });

  it('liefert die nächste offene Kachel (Videos übersprungen)', () => {
    const first = nextTile(course, {}, emptyState());
    expect(first.study).toBe(a1);
    expect(first.tile.type).toBe('learn');
    const progress = Object.fromEntries(a1.lines.map((l) => [l.id, done]));
    const state = { ...emptyState(), drills: { [a1.id]: 1 } };
    const next = nextTile(course, progress, state);
    expect(next.study).toBe(b1);
    expect(next.chapter.title).toBe('Kapitel B');
    const allDone = { ...progress, ...Object.fromEntries(b1.lines.map((l) => [l.id, done])) };
    expect(nextTile(course, allDone, { ...state, drills: { [a1.id]: 1, [b1.id]: 1 } })).toBe(null);
  });

  it('findet Kacheln über die ID', () => {
    const tile = b1.tiles[0];
    expect(findTile(course, tile.id)).toMatchObject({ study: b1, tile });
    expect(findTile(course, 'gibt-es-nicht')).toBe(null);
  });
});

describe('levelInfo', () => {
  it('folgt der Formel 50·n·(n−1)', () => {
    expect([1, 2, 3, 4, 5].map(levelStart)).toEqual([0, 100, 300, 600, 1000]);
    expect(levelInfo(0)).toEqual({ level: 1, intoLevel: 0, span: 100, nextAt: 100 });
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100)).toEqual({ level: 2, intoLevel: 0, span: 200, nextAt: 300 });
    expect(levelInfo(450)).toMatchObject({ level: 3, intoLevel: 150, span: 300 });
  });
});

describe('streakInfo', () => {
  it('zählt aufeinanderfolgende aktive Tage bis heute', () => {
    const byDay = { [day(0)]: 5, [day(-1)]: 10, [day(-2)]: 3, [day(-4)]: 7 };
    const s = streakInfo(byDay, NOW);
    expect(s.current).toBe(3);
    expect(s.activeToday).toBe(true);
  });

  it('bricht nicht ab, solange heute noch nichts gemacht wurde', () => {
    const s = streakInfo({ [day(-1)]: 10, [day(-2)]: 3 }, NOW);
    expect(s.current).toBe(2);
    expect(s.activeToday).toBe(false);
    expect(streakInfo({ [day(-2)]: 3 }, NOW).current).toBe(0);
  });

  it('liefert die Woche von Montag bis Sonntag', () => {
    const s = streakInfo({ [day(-1)]: 1 }, NOW);
    expect(s.week.map((d) => d.label)).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
    expect(s.week[0]).toMatchObject({ key: day(-1), active: true, isToday: false });
    expect(s.week[1]).toMatchObject({ key: day(0), active: false, isToday: true });
  });
});

describe('xpLastDays', () => {
  it('liefert die letzten 7 Tage, ältester zuerst', () => {
    const days = xpLastDays({ [day(0)]: 55, [day(-6)]: 4 }, 7, NOW);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ key: day(-6), label: '14', xp: 4 });
    expect(days[6]).toEqual({ key: day(0), label: '20', xp: 55 });
    expect(days.slice(1, 6).every((d) => d.xp === 0)).toBe(true);
  });
});

describe('weeklyLeague', () => {
  it('summiert nur die XP seit Montag', () => {
    const w = weeklyLeague({ [day(0)]: 40, [day(-1)]: 20, [day(-2)]: 500 }, NOW);
    expect(w.xp).toBe(60);
    expect(w.league).toBe(LEAGUES[1]);
    expect(w.next).toBe(LEAGUES[2]);
    expect(w.daysLeft).toBe(6);
  });

  it('erreicht die höchste Liga ohne nächste Stufe', () => {
    const w = weeklyLeague({ [day(0)]: 5000 }, NOW);
    expect(w.league).toBe(LEAGUES.at(-1));
    expect(w.next).toBe(null);
  });
});
