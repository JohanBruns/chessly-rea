import { describe, expect, it } from 'vitest';
import { tileLabel, tileLayout } from '../src/ui/tilePath.js';

const learn = (first, n) => ({ type: 'learn', firstVariation: first, lines: Array(n).fill({}) });

describe('tileLayout', () => {
  it('legt Kacheln im Zickzack an, das Video links neben die erste', () => {
    const entries = [{ tile: { type: 'video' } }, { tile: learn(1, 2) }, { tile: learn(3, 2) }, { tile: learn(5, 1) }, { tile: learn(6, 1) }, { tile: { type: 'drill', lines: [] } }];
    expect(tileLayout(entries).map((e) => [e.tile.type, e.col, e.row])).toEqual([
      ['video', -1, 1],
      ['learn', 0, 0],
      ['learn', 1, 1],
      ['learn', 0, 2],
      ['learn', -1, 3],
      ['drill', 0, 4],
    ]);
  });
});

describe('tileLabel', () => {
  it('beschreibt die Kachel', () => {
    expect(tileLabel(learn(3, 2))).toBe('Varianten 3–4 lernen');
    expect(tileLabel(learn(5, 1))).toBe('Variante 5 lernen');
    expect(tileLabel({ type: 'drill', lines: [1, 2, 3] })).toBe('Drill: alle 3 Varianten gemischt');
    expect(tileLabel({ type: 'video' })).toBe('Video ansehen');
  });
});
