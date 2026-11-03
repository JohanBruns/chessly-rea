import { describe, expect, it } from 'vitest';

globalThis.location ??= { origin: 'https://app.test' };
const { cacheKey, downloadErrorMessage, formatBytes, playbackSrc } = await import('../src/offlineVideos.js');

const VIDEO = '/downloader/downloads/The Caro-Kann Defense/1. Einführung #1.mp4';

describe('Video-URLs', () => {
  it('Cache-Schlüssel ist die absolute, kodierte URL ohne Query', () => {
    expect(cacheKey(VIDEO)).toBe('https://app.test/downloader/downloads/The%20Caro-Kann%20Defense/1.%20Einf%C3%BChrung%20%231.mp4');
  });

  it('gespeicherte Videos bekommen ?offline, andere nicht', () => {
    expect(playbackSrc(VIDEO, false)).not.toContain('?');
    expect(playbackSrc(VIDEO, true)).toMatch(/\.mp4\?offline$/);
  });

  it('der Service Worker findet das Video unter dem Cache-Schlüssel', () => {
    const url = new URL(playbackSrc(VIDEO, true), 'https://app.test');
    expect(url.origin + url.pathname).toBe(cacheKey(VIDEO));
  });
});

describe('formatBytes', () => {
  it('MB mit einer Nachkommastelle unter 10, GB ab 1000 MB', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(3_456_789)).toBe('3,5 MB');
    expect(formatBytes(36_100_000)).toBe('36,1 MB');
    expect(formatBytes(840_000_000)).toBe('840 MB');
    expect(formatBytes(1_200_000_000)).toBe('1,2 GB');
  });
});

describe('downloadErrorMessage', () => {
  it('Speicher voll', () => {
    expect(downloadErrorMessage(new DOMException('voll', 'QuotaExceededError'))).toMatch(/Nicht genug Speicher/);
    expect(downloadErrorMessage({ code: 'quota' })).toMatch(/Nicht genug Speicher/);
  });

  it('Anmeldung abgelaufen und fehlende Datei', () => {
    expect(downloadErrorMessage({ code: 'status', status: 403 })).toMatch(/Nicht angemeldet/);
    expect(downloadErrorMessage({ code: 'status', status: 404 })).toMatch(/nicht auf dem Server/);
  });

  it('abgebrochener Download', () => {
    expect(downloadErrorMessage({ code: 'incomplete' })).toMatch(/unterbrochen/);
    expect(downloadErrorMessage(new TypeError('Failed to fetch'))).toMatch(/fehlgeschlagen|Internetverbindung/);
  });
});
