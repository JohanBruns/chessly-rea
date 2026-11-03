import { describe, expect, it } from 'vitest';
import { parseSize } from '../scripts/r2Usage.js';
import { projectedBytes, referencedVideos } from '../scripts/uploadVideos.js';

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
