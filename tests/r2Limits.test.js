import { describe, expect, it } from 'vitest';
import { ALERT_RATIO, FREE_STORAGE_BYTES, monthlyCostUsd, STORAGE_LIMIT_BYTES } from '../scripts/r2Limits.js';

describe('R2-Grenzen', () => {
  it('sperrt Uploads ab 25 GB und warnt bei 85 % davon', () => {
    expect(STORAGE_LIMIT_BYTES).toBe(25e9);
    expect(Math.round(STORAGE_LIMIT_BYTES * ALERT_RATIO)).toBe(21.25e9);
  });

  it('lässt die Sperre über dem Freikontingent von 10 GB', () => {
    expect(STORAGE_LIMIT_BYTES).toBeGreaterThan(FREE_STORAGE_BYTES);
  });
});

describe('monthlyCostUsd', () => {
  it('kostet bis 10 GB nichts', () => {
    expect(monthlyCostUsd(0)).toBe(0);
    expect(monthlyCostUsd(4.08e9)).toBe(0);
    expect(monthlyCostUsd(10e9)).toBe(0);
  });

  it('rechnet 0,015 $ pro GB über den freien 10 GB', () => {
    expect(monthlyCostUsd(12e9)).toBeCloseTo(0.03, 10);
    expect(monthlyCostUsd(20e9)).toBeCloseTo(0.15, 10);
    expect(monthlyCostUsd(25e9)).toBeCloseTo(0.225, 10);
    expect(monthlyCostUsd(30e9)).toBeCloseTo(0.3, 10);
  });

  it('rundet wie Cloudflare auf volle GB auf', () => {
    expect(monthlyCostUsd(10.1e9)).toBeCloseTo(0.015, 10);
    expect(monthlyCostUsd(11.0e9)).toBeCloseTo(0.015, 10);
    expect(monthlyCostUsd(11.01e9)).toBeCloseTo(0.03, 10);
  });
});
