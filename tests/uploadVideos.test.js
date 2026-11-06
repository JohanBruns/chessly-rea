import { describe, expect, it } from 'vitest';
import { parseSize } from '../scripts/r2Usage.js';
import { projectedBytes, referencedVideos, withRetry } from '../scripts/uploadVideos.js';

describe('withRetry', () => {
  const noSleep = { sleep: async () => {} };

  it('gibt das Ergebnis zurück, ohne zu warten, wenn gleich der erste Versuch klappt', async () => {
    const pauses = [];
    expect(await withRetry(async () => 'ok', { sleep: async (ms) => pauses.push(ms) })).toBe('ok');
    expect(pauses).toEqual([]);
  });

  it('versucht es nach einem Fehler (z. B. 401 Authentication error) noch einmal', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('401 Authentication error');
      return 'hochgeladen';
    }, noSleep);
    expect(result).toBe('hochgeladen');
    expect(calls).toBe(3);
  });

  it('gibt nach drei Fehlversuchen auf und wirft den letzten Fehler', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new Error(`Fehler ${calls}`); }, noSleep)).rejects.toThrow('Fehler 3');
    expect(calls).toBe(3);
  });

  it('wartet zwischen den Versuchen immer länger und meldet jeden Wiederholungsversuch', async () => {
    const pauses = [];
    const notices = [];
    await expect(
      withRetry(async () => { throw new Error('x'); }, { pauseMs: 100, sleep: async (ms) => pauses.push(ms), onRetry: (attempt) => notices.push(attempt) }),
    ).rejects.toThrow('x');
    expect(pauses).toEqual([100, 200]);
    expect(notices).toEqual([1, 2]);
  });

  it('funktioniert auch mit Aufrufen, die nicht async sind (wrangler läuft synchron)', async () => {
    let calls = 0;
    const result = await withRetry(() => {
      calls++;
      if (calls === 1) throw new Error('Netz weg');
      return 'ok';
    }, noSleep);
    expect(result).toBe('ok');
  });
});

describe('referencedVideos', () => {
  it('sammelt lokale Videos aus den PGN-Kopfzeilen, ohne Dubletten und ohne externe Links', () => {
    const pgn = '[Study "A"]\r\n[Video "/downloader/downloads/Kurs/01 A & B.mp4"]\r\n\r\n1. e4 *\n[Video "https://youtu.be/x"]\n[Video "/downloader/downloads/Kurs/01 A & B.mp4"]\n';
    expect(referencedVideos([pgn, '[Video "/downloader/downloads/Kurs/02.mp4"]'])).toEqual(['Kurs/01 A & B.mp4', 'Kurs/02.mp4']);
  });
});

describe('projectedBytes', () => {
  it('rechnet mit dem größeren Wert aus Bucket und eigener Liste plus den neuen Dateien', () => {
    const state = { a: '3000000000:1', b: '1000000000:2' };
    expect(projectedBytes({ remoteBytes: 0, state, pending: [{ size: 5e8 }] })).toBe(4.5e9);
    expect(projectedBytes({ remoteBytes: 6e9, state, pending: [{ size: 5e8 }] })).toBe(6.5e9);
  });
});

describe('parseSize', () => {
  it('versteht die Größenangaben von wrangler', () => {
    expect(parseSize('0 B')).toBe(0);
    expect(parseSize('1.5 GB')).toBe(1.5e9);
    expect(parseSize('512 MiB')).toBe(512 * 2 ** 20);
    expect(() => parseSize('viel')).toThrow();
  });
});
