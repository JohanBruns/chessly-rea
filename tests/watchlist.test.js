import { describe, expect, it } from 'vitest';
import { pendingWatchNotifications } from '../src/watchlist.js';

const CATALOG = {
  fetchedAt: '2026-11-04T21:55:55+00:00',
  courses: [
    { id: 'id-caro', name: 'The Caro-Kann Defense', comingSoon: false, videosDownloaded: true },
    { id: 'id-center', name: 'The Center Game', comingSoon: true, videosDownloaded: false },
    { id: 'id-london', name: 'The London System', comingSoon: false, videosDownloaded: false },
  ],
  categories: [],
};

const entry = (overrides = {}) => ({
  name: 'The Caro-Kann Defense',
  since: 1,
  comingSoon: false,
  videosDownloaded: false,
  ...overrides,
});

describe('pendingWatchNotifications', () => {
  it('meldet nichts, solange sich nichts geändert hat', () => {
    const watch = { 'id-caro': entry({ videosDownloaded: true }) };
    expect(pendingWatchNotifications(watch, [], CATALOG)).toEqual([]);
  });

  it('meldet einen Kurs, der jetzt in der App liegt', () => {
    const watch = { 'id-caro': entry() };
    const changes = pendingWatchNotifications(watch, [{ chesslyId: 'id-caro', name: 'Caro-Kann' }], CATALOG);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ id: 'id-caro', inApp: true });
  });

  it('meldet einen Kurs, der bei Chessly nicht mehr „Coming soon“ ist', () => {
    const watch = { 'id-center': entry({ name: 'The Center Game', comingSoon: true }) };
    const catalog = { ...CATALOG, courses: [{ ...CATALOG.courses[1], comingSoon: false }] };
    const changes = pendingWatchNotifications(watch, [], catalog);
    expect(changes[0]).toMatchObject({ id: 'id-center', released: true, inApp: false });
  });

  it('meldet, wenn die Videos heruntergeladen wurden', () => {
    const watch = { 'id-caro': entry() };
    const changes = pendingWatchNotifications(watch, [], CATALOG);
    expect(changes[0]).toMatchObject({ id: 'id-caro', downloaded: true });
  });

  it('überspringt Kurse, die schon gemeldet wurden', () => {
    const watch = { 'id-caro': entry({ notifiedAt: 123 }) };
    expect(pendingWatchNotifications(watch, [{ chesslyId: 'id-caro' }], CATALOG)).toEqual([]);
  });

  it('meldet keinen Kurs, der weder in der App noch freigeschaltet ist', () => {
    const watch = { 'id-london': entry({ name: 'The London System' }) };
    expect(pendingWatchNotifications(watch, [], CATALOG)).toEqual([]);
  });
});
