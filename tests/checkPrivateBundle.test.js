import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkPrivateBundle } from '../scripts/checkPrivateBundle.js';

const PGN = '[Course "Testkurs"]\n\n1. e4 {Willkommen im Testkurs mit langer Einleitung} c6 *\n';
const BUNDLED = `export default ${JSON.stringify(PGN)}`;
let root;
let distDir;
let openingsDir;

function write(path, text) {
  const file = join(distDir, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'bundle-'));
  distDir = join(root, 'dist');
  openingsDir = join(root, 'openings');
  mkdirSync(distDir);
  mkdirSync(openingsDir);
  writeFileSync(join(openingsDir, 'kurs.pgn'), PGN);
  write('index.html', '<!doctype html>');
  write('assets/index-abc.js', 'console.log("anmeldung")');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const check = () => checkPrivateBundle({ distDir, openingsDir });

describe('checkPrivateBundle', () => {
  it('ist zufrieden, wenn Kursinhalte nur im geschützten Teil liegen', () => {
    write('app/app-abc.js', BUNDLED);
    expect(check()).toEqual([]);
  });

  it('meldet Kursinhalte in einer öffentlichen Datei', () => {
    write('app/app-abc.js', BUNDLED);
    write('assets/index-abc.js', BUNDLED);
    const problems = check();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/kurs\.pgn steckt in der öffentlichen Datei/);
    expect(problems[0]).toMatch(/index-abc\.js/);
  });

  it('meldet, wenn der geschützte Teil die Inhalte gar nicht enthält', () => {
    write('app/app-abc.js', 'leer');
    expect(check()[0]).toMatch(/fehlt im geschützten Teil/);
  });

  it('meldet PGN-Dateien, die sie nicht erkennen kann', () => {
    write('app/app-abc.js', BUNDLED);
    writeFileSync(join(openingsDir, 'leer.pgn'), '[Course "Ohne Züge"]\n');
    expect(check()[0]).toMatch(/leer\.pgn: keine Zugfolge/);
  });
});
