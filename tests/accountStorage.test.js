import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addXp, clearLegacyData, legacyData, loadSettings, loadXp, onSyncedWrite, setCollapsed, useAccountStorage } from '../src/storage.js';

const ANNA = { id: 1, username: 'anna' };
const BEN = { id: 2, username: 'ben' };

beforeEach(() => {
  const items = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useAccountStorage(null);
  onSyncedWrite(null);
});

describe('Speicher pro Konto', () => {
  it('trennt den Lernstand der Konten auf einem Gerät', () => {
    useAccountStorage(ANNA);
    addXp(10);
    useAccountStorage(BEN);
    expect(loadXp().total).toBe(0);
    addXp(3);
    useAccountStorage(ANNA);
    expect(loadXp().total).toBe(10);
  });

  it('nutzt ohne Konto weiter die bisherigen Schlüssel', () => {
    localStorage.setItem('chesslyRea.xp.v1', JSON.stringify({ total: 42, byDay: {} }));
    expect(loadXp().total).toBe(42);
    useAccountStorage(ANNA);
    expect(loadXp().total).toBe(0);
  });

  it('findet und löscht den Lernstand ohne Konto', () => {
    localStorage.setItem('chesslyRea.xp.v1', JSON.stringify({ total: 42, byDay: {} }));
    useAccountStorage(ANNA);
    addXp(1);
    expect(legacyData()).toEqual({ xp: { total: 42, byDay: {} } });
    clearLegacyData();
    expect(legacyData()).toEqual({});
    expect(loadXp().total).toBe(1);
  });

  it('nimmt den Benutzernamen als Anzeigenamen, solange kein eigener gesetzt ist', () => {
    expect(loadSettings().name).toBe('Schachfreund');
    useAccountStorage(ANNA);
    expect(loadSettings().name).toBe('anna');
  });

  it('meldet nur Änderungen an synchronisierten Daten', () => {
    const listener = vi.fn();
    onSyncedWrite(listener);
    useAccountStorage(ANNA);
    addXp(1);
    expect(listener).toHaveBeenCalledWith('xp');
    listener.mockClear();
    setCollapsed('study', true);
    expect(listener).not.toHaveBeenCalled();
  });
});
