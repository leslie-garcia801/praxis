import { describe, expect, it } from 'vitest';
import { diasEntre, fechaLocal, inicioDelDiaSiguiente, inicioSemana, instanteLocal, sumarDias } from './tiempo.js';

// Monterrey is UTC-6 all year (Mexico dropped DST in 2022).
const MTY = 'America/Monterrey';

describe('fechaLocal', () => {
  it('RN-15: returns the Monterrey calendar date, not the UTC one', () => {
    // 20:00 in Monterrey = 02:00 UTC of the next day
    expect(fechaLocal(new Date('2026-11-09T20:00:00-06:00'), MTY)).toBe('2026-11-09');
  });

  it('handles the first minute of the local day', () => {
    expect(fechaLocal(new Date('2026-11-10T00:00:00-06:00'), MTY)).toBe('2026-11-10');
  });
});

describe('instanteLocal', () => {
  it('converts a Monterrey wall-clock time to its UTC instant', () => {
    expect(instanteLocal('2026-11-09', '23:59', MTY).toISOString()).toBe('2026-11-10T05:59:00.000Z');
  });

  it('works for a zone with daylight saving time', () => {
    // New York is UTC-4 in July and UTC-5 in December
    expect(instanteLocal('2026-07-01', '12:00', 'America/New_York').toISOString()).toBe(
      '2026-07-01T16:00:00.000Z',
    );
    expect(instanteLocal('2026-12-01', '12:00', 'America/New_York').toISOString()).toBe(
      '2026-12-01T17:00:00.000Z',
    );
  });
});

describe('inicioDelDiaSiguiente', () => {
  it('returns the next local midnight', () => {
    expect(inicioDelDiaSiguiente(new Date('2026-11-09T22:30:00-06:00'), MTY).toISOString()).toBe(
      '2026-11-10T06:00:00.000Z',
    );
  });

  it('crosses month and year boundaries', () => {
    expect(inicioDelDiaSiguiente(new Date('2026-12-31T10:00:00-06:00'), MTY).toISOString()).toBe(
      '2027-01-01T06:00:00.000Z',
    );
  });
});

describe('sumarDias', () => {
  it('adds calendar days across month boundaries', () => {
    expect(sumarDias('2026-11-28', 5)).toBe('2026-12-03');
  });

  it('subtracts days', () => {
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('diasEntre', () => {
  it('counts calendar days between two dates', () => {
    expect(diasEntre('2026-11-11', '2026-11-20')).toBe(9);
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('is negative when the second date is earlier', () => {
    expect(diasEntre('2026-11-20', '2026-11-11')).toBe(-9);
  });
});

describe('inicioSemana', () => {
  it('RF-19: a Sunday goes back to the previous Monday', () => {
    expect(inicioSemana('2026-11-15')).toBe('2026-11-09');
  });

  it('keeps a Monday as it is', () => {
    expect(inicioSemana('2026-11-09')).toBe('2026-11-09');
  });

  it('goes back to the Monday of a midweek day', () => {
    expect(inicioSemana('2026-11-11')).toBe('2026-11-09');
  });

  it('crosses the year boundary', () => {
    // Friday 1 Jan 2027 belongs to the week of Monday 28 Dec 2026.
    expect(inicioSemana('2027-01-01')).toBe('2026-12-28');
  });
});
