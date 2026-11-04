import { describe, expect, it } from 'vitest';
import { ALERT_BYTES, alertMail, bucketUsage, checkUsage } from '../usageAlert/index.js';

// R2-Bucket mit Seiten zu je zwei Objekten
function fakeBucket(sizes) {
  return {
    async list({ cursor }) {
      const start = Number(cursor || 0);
      const objects = sizes.slice(start, start + 2).map((size) => ({ size }));
      const truncated = start + 2 < sizes.length;
      return { objects, truncated, cursor: truncated ? String(start + 2) : undefined };
    },
  };
}

function fakeResend(status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(status === 200 ? '{"id":"1"}' : 'invalid key', { status });
  };
  return { calls, fetchImpl };
}

const env = (sizes) => ({ VIDEOS: fakeBucket(sizes), RESEND_API_KEY: 're_test', ALERT_EMAIL: 'ich@example.org' });

describe('Speicher-Warnung', () => {
  it('liegt bei 85 % der Upload-Sperre von 9,5 GB', () => {
    expect(ALERT_BYTES).toBe(8.075e9);
  });

  it('zählt alle Seiten der Bucket-Liste', async () => {
    expect(await bucketUsage(fakeBucket([1, 2, 3, 4, 5]))).toEqual({ bytes: 15, objects: 5 });
  });

  it('schickt unter der Schwelle keine Mail', async () => {
    const resend = fakeResend();
    const result = await checkUsage(env([3e9, 3e9]), { fetchImpl: resend.fetchImpl });
    expect(result.sent).toBe(false);
    expect(resend.calls).toHaveLength(0);
  });

  it('schickt ab der Schwelle eine Mail an die eigene Adresse', async () => {
    const resend = fakeResend();
    const result = await checkUsage(env([4e9, 4.075e9]), { fetchImpl: resend.fetchImpl });
    expect(result).toEqual({ bytes: 8.075e9, objects: 2, sent: true });
    expect(resend.calls[0].url).toBe('https://api.resend.com/emails');
    expect(resend.calls[0].init.headers.Authorization).toBe('Bearer re_test');
    expect(resend.calls[0].body.to).toEqual(['ich@example.org']);
    expect(resend.calls[0].body.subject).toBe('Chessly-REA: Video-Speicher bei 85 % der Grenze');
  });

  it('schickt im Test immer eine Probe-Mail', async () => {
    const resend = fakeResend();
    await checkUsage(env([1e9]), { test: true, fetchImpl: resend.fetchImpl });
    expect(resend.calls[0].body.subject).toBe('Chessly-REA: Test der Speicher-Warnung');
    expect(resend.calls[0].body.text).toContain('Belegt: 1.00 GB in 1 Videos');
  });

  it('meldet abgelehnte Mails und fehlende Einstellungen als Fehler', async () => {
    await expect(checkUsage(env([9e9]), { fetchImpl: fakeResend(401).fetchImpl })).rejects.toThrow('401');
    await expect(checkUsage({ VIDEOS: fakeBucket([9e9]) }, { fetchImpl: fakeResend().fetchImpl })).rejects.toThrow('RESEND_API_KEY');
  });

  it('nennt in der Warnung Belegung und Grenzen', () => {
    const { text } = alertMail({ bytes: 7e9, objects: 50 });
    expect(text).toContain('Belegt: 7.00 GB in 50 Videos');
    expect(text).toContain('Upload-Sperre ab: 9.50 GB');
  });
});
