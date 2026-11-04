import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyStockfish, findStockfishBin } from '../scripts/copyStockfish.js';

const FILES = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];
let base;

function install(dir) {
  const bin = join(dir, 'node_modules', 'stockfish', 'bin');
  mkdirSync(bin, { recursive: true });
  for (const file of FILES) writeFileSync(join(bin, file), 'engine');
  return bin;
}

const copied = (root) => FILES.every((file) => existsSync(join(root, 'public', 'stockfish', file)));

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'copyStockfish-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('copyStockfish', () => {
  it('kopiert die Engine aus dem eigenen node_modules', () => {
    const bin = install(base);
    expect(copyStockfish(base, { strict: true })).toBe(bin);
    expect(copied(base)).toBe(true);
  });

  it('findet die Engine im Hauptordner, wenn ein Worktree kein eigenes node_modules hat', () => {
    const bin = install(base);
    const worktree = join(base, '.claude', 'worktrees', 'test');
    mkdirSync(worktree, { recursive: true });
    expect(findStockfishBin(worktree)).toBe(bin);
    copyStockfish(worktree, { strict: true });
    expect(copied(worktree)).toBe(true);
  });

  it('bricht mit --strict ab, wenn die Engine fehlt', () => {
    expect(() => copyStockfish(base, { strict: true })).toThrow(/Stockfish fehlt/);
    expect(copied(base)).toBe(false);
  });

  it('warnt ohne --strict nur, damit der Dev-Server trotzdem startet', () => {
    expect(copyStockfish(base)).toBe(null);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('akzeptiert eine frühere Kopie auch mit --strict', () => {
    const target = join(base, 'public', 'stockfish');
    mkdirSync(target, { recursive: true });
    for (const file of FILES) writeFileSync(join(target, file), 'engine');
    expect(copyStockfish(base, { strict: true })).toBe(null);
  });

  it('bricht ab, wenn nur eine der beiden Dateien aus einer früheren Kopie da ist', () => {
    const target = join(base, 'public', 'stockfish');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, FILES[0]), 'engine');
    expect(() => copyStockfish(base, { strict: true })).toThrow(/Stockfish fehlt/);
  });
});
