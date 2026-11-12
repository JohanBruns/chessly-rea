import { describe, expect, it } from 'vitest';
import { describeTransfer, formatDuration, formatSize, formatSpeed } from '../scripts/transferSpeed.js';

describe('transferSpeed', () => {
  it('zeigt Größen in MB und ab 1 GB in GB mit Komma', () => {
    expect(formatSize(54_000_000)).toBe('54 MB');
    expect(formatSize(2_340_000_000)).toBe('2,3 GB');
  });

  it('zeigt Zeiten in Sekunden und ab einer Minute in Minuten', () => {
    expect(formatDuration(12_400)).toBe('12 s');
    expect(formatDuration(185_000)).toBe('3 min 05 s');
  });

  it('rechnet Bytes pro Sekunde in MB/s und Mbit/s um', () => {
    expect(formatSpeed(4_500_000)).toBe('4,5 MB/s (36 Mbit/s)');
  });

  it('beschreibt eine Übertragung mit Durchschnittstempo', () => {
    expect(describeTransfer(54_000_000, 12_000)).toBe('54 MB in 12 s, Ø 4,5 MB/s (36 Mbit/s)');
  });

  it('lässt das Tempo weg, wenn die Zeit zu kurz zum Messen ist', () => {
    expect(describeTransfer(1_000_000, 100)).toBe('1 MB in 0 s');
  });
});
