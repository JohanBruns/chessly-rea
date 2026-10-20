import { describe, expect, it } from 'vitest';
import { shuffle, TileRun } from '../src/tileSession.js';

const lines = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const ok = { mistakes: 0, hints: 0 };

describe('TileRun (Lern-Kachel)', () => {
  it('lernt und wiederholt jede Variante nacheinander', () => {
    const run = new TileRun(lines.slice(0, 2), { kind: 'learn' });
    expect(run.segmentCount).toBe(4);
    expect(run.steps.map((s) => `${s.line.id}:${s.phase}`)).toEqual(['a:learn', 'a:review', 'b:learn', 'b:review']);
    expect(run.segments().map((s) => s.state)).toEqual(['active', 'todo', 'todo', 'todo']);
    expect(run.complete(ok)).toMatchObject({ variationDone: false });
    expect(run.current).toMatchObject({ phase: 'review', variation: 0 });
    expect(run.complete(ok)).toMatchObject({ variationDone: true });
    expect(run.segments().map((s) => s.state)).toEqual(['done', 'done', 'active', 'todo']);
    run.complete(ok);
    run.complete(ok);
    expect(run.finished).toBe(true);
    expect(run.current).toBe(null);
  });

  it('„Nochmal“ wiederholt das Lernen derselben Variante', () => {
    const run = new TileRun(lines.slice(0, 2), { kind: 'learn' });
    run.complete(ok);
    expect(run.redo()).toBe(true);
    expect(run.current).toMatchObject({ phase: 'learn', variation: 0 });
    expect(run.segments()[0].state).toBe('active');
    run.complete(ok);
    run.complete(ok);
    expect(run.redo()).toBe(false);
  });

  it('wiederholt im Lernpfad keine Varianten mit Fehlern', () => {
    const run = new TileRun(lines.slice(0, 1), { kind: 'learn' });
    run.complete(ok);
    expect(run.complete({ mistakes: 2, hints: 0 }).retry).toBe(false);
    expect(run.finished).toBe(true);
    expect(run.summary()).toEqual({ lines: 1, perfect: 0, mistakes: 2 });
  });
});

describe('TileRun (Drill)', () => {
  it('mischt alle Varianten, ein Segment je Variante', () => {
    const run = new TileRun(lines, { kind: 'drill', random: () => 0 });
    expect(run.segmentCount).toBe(3);
    expect(run.steps.every((s) => s.phase === 'drill')).toBe(true);
    expect(new Set(run.steps.map((s) => s.line.id))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('hängt Varianten mit Fehlern einmal hinten an', () => {
    const run = new TileRun(lines.slice(0, 2), { kind: 'drill', random: () => 0.99 });
    const first = run.current.line;
    expect(run.complete({ mistakes: 1, hints: 0 }).retry).toBe(true);
    run.complete(ok);
    expect(run.current).toMatchObject({ line: first, retry: true });
    expect(run.complete({ mistakes: 1, hints: 0 }).retry).toBe(false);
    expect(run.finished).toBe(true);
    expect(run.segments().every((s) => s.state === 'done')).toBe(true);
    expect(run.summary()).toEqual({ lines: 2, perfect: 1, mistakes: 1 });
  });
});

describe('shuffle', () => {
  it('verändert das Original nicht und behält alle Elemente', () => {
    const input = [1, 2, 3, 4];
    const out = shuffle(input);
    expect(input).toEqual([1, 2, 3, 4]);
    expect([...out].sort()).toEqual([1, 2, 3, 4]);
  });
});
