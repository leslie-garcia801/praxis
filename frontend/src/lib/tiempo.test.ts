import { describe, expect, it } from 'vitest';
import {
  diaMonterrey,
  esHoy,
  formatDiaCorto,
  formatFechaLarga,
  formatFecha,
  formatHora,
  formatHoras,
  formatRangoSemana,
  hoyMonterrey,
  instanteMonterrey,
  lunesDeSemana,
  sumarDias,
} from './tiempo';

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

  it('sumarDias moves a calendar date across month and year boundaries', () => {
    expect(sumarDias('2026-11-09', 7)).toBe('2026-11-16');
    expect(sumarDias('2026-11-02', -7)).toBe('2026-10-26');
    expect(sumarDias('2026-12-28', 7)).toBe('2027-01-04');
    expect(sumarDias('2027-01-04', -7)).toBe('2026-12-28');
  });

  it('formatFechaLarga shows day, month and year of a calendar date', () => {
    expect(formatFechaLarga('2026-11-16')).toBe('16 de noviembre de 2026');
  });

  it('formatDiaCorto shows weekday and day number', () => {
    expect(formatDiaCorto('2026-11-09')).toBe('lunes 9');
    expect(formatDiaCorto('2026-11-15')).toBe('domingo 15');
  });

  it('formatRangoSemana abbreviates within a month and adds month or year when crossing', () => {
    expect(formatRangoSemana('2026-11-09', '2026-11-15')).toBe('9 al 15 de noviembre');
    expect(formatRangoSemana('2026-10-26', '2026-11-01')).toBe('26 de octubre al 1 de noviembre');
    expect(formatRangoSemana('2026-12-28', '2027-01-03')).toBe('28 de diciembre de 2026 al 3 de enero de 2027');
  });

  it('RN-15: hoyMonterrey and diaMonterrey use the Monterrey calendar day', () => {
    expect(hoyMonterrey(new Date('2026-11-12T05:45:00Z'))).toBe('2026-11-11');
    expect(diaMonterrey('2026-11-12T07:00:00Z')).toBe('2026-11-12');
  });
});

describe('instanteMonterrey (RN-15)', () => {
  it('RN-15: turns a Monterrey calendar date and time into a UTC instant', () => {
    expect(instanteMonterrey('2026-11-10', '09:00')).toBe('2026-11-10T15:00:00.000Z');
    expect(instanteMonterrey('2026-11-10', '23:30')).toBe('2026-11-11T05:30:00.000Z');
    expect(instanteMonterrey('2026-11-10', '00:00')).toBe('2026-11-10T06:00:00.000Z');
  });

  it('round-trips with formatHora and diaMonterrey', () => {
    const iso = instanteMonterrey('2026-07-15', '14:45');
    expect(formatHora(iso)).toBe('14:45');
    expect(diaMonterrey(iso)).toBe('2026-07-15');
  });
});

describe('lunesDeSemana (RF-19)', () => {
  it('returns the Monday of the week, Monday to Sunday', () => {
    expect(lunesDeSemana('2026-11-09')).toBe('2026-11-09');
    expect(lunesDeSemana('2026-11-10')).toBe('2026-11-09');
    expect(lunesDeSemana('2026-11-15')).toBe('2026-11-09');
    expect(lunesDeSemana('2026-11-16')).toBe('2026-11-16');
  });
});

describe('isoConOffset', () => {
  it('RF-16: conserva el instante y escribe el desfase del dispositivo', async () => {
    const { isoConOffset } = await import('./tiempo');
    const ahora = new Date(Date.UTC(2026, 10, 16, 14, 5, 7));
    const iso = isoConOffset(ahora);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(new Date(iso).getTime()).toBe(ahora.getTime());
  });
});
