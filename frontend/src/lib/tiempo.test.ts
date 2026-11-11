import { describe, expect, it } from 'vitest';
import { esHoy, formatFecha, formatHora, formatHoras } from './tiempo';

describe('tiempo (RN-15, America/Monterrey)', () => {
  it('RN-15: formatHora uses Monterrey time, not UTC or the device zone', () => {
    // 05:30Z is 23:30 of the previous day in Monterrey (UTC-6, no DST in November).
    expect(formatHora('2026-11-12T05:30:00Z')).toBe('23:30');
    expect(formatHora('2026-11-11T16:11:00Z')).toBe('10:11');
  });

  it('formatFecha formats a calendar date without shifting the day', () => {
    expect(formatFecha('2026-11-16')).toBe('lunes 16 de noviembre');
    expect(formatFecha('2026-01-01')).toBe('jueves 1 de enero');
  });

  it('formatFecha also accepts an instant and shows its Monterrey day', () => {
    expect(formatFecha('2026-11-12T05:30:00Z')).toBe('miércoles 11 de noviembre');
  });

  it('formatHoras shows hours and minutes, and only hours when minutes are 0', () => {
    expect(formatHoras(750)).toBe('12 h 30 min');
    expect(formatHoras(28800)).toBe('480 h');
    expect(formatHoras(0)).toBe('0 h');
    expect(formatHoras(45)).toBe('0 h 45 min');
  });

  it('RN-15: esHoy compares Monterrey calendar days', () => {
    // In UTC both instants are on Nov 12, but in Monterrey the first is still Nov 11.
    const ahora = new Date('2026-11-12T05:45:00Z');
    expect(esHoy('2026-11-12T05:30:00Z', ahora)).toBe(true);
    expect(esHoy('2026-11-12T07:00:00Z', ahora)).toBe(false);
    expect(esHoy('2026-11-11T15:00:00Z', ahora)).toBe(true);
  });
});
