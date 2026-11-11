import { describe, expect, it } from 'vitest';
import { instanteLocal } from '../lib/tiempo.js';
import { turnoFueraDeHorario } from './horario.js';

// 2026-11-09 is a Monday (local day 1) and 2026-11-14 a Saturday (6).
const horario: { diasPactados: number[]; horaEntrada: string | null; horaSalida: string | null } = { diasPactados: [1, 2, 3, 4, 5], horaEntrada: '08:00', horaSalida: '14:00' };
const turno = (dia: string, desde: string, hasta: string | null, h: Partial<typeof horario> = {}) =>
  turnoFueraDeHorario({
    entrada: instanteLocal(dia, desde),
    salida: hasta === null ? null : instanteLocal(dia, hasta),
    ...horario,
    ...h,
  });

describe('turnoFueraDeHorario', () => {
  it('RN-06b: un turno dentro del horario no se marca', () => {
    expect(turno('2026-11-09', '08:30', '13:30')).toBe(false);
  });

  it('RN-06b: un día no pactado se marca', () => {
    expect(turno('2026-11-14', '08:30', '13:30')).toBe(true);
  });

  it('RN-06b: un turno de madrugada (02:00-04:00) se marca', () => {
    expect(turno('2026-11-09', '02:00', '04:00')).toBe(true);
  });

  it('RN-06b: llegar antes (07:00-09:00) no se marca mientras se cruce con el horario', () => {
    expect(turno('2026-11-09', '07:00', '09:00')).toBe(false);
  });

  it('RN-06b: salir después (13:00-16:00) no se marca mientras se cruce con el horario', () => {
    expect(turno('2026-11-09', '13:00', '16:00')).toBe(false);
  });

  it('RN-06b: un turno que termina justo cuando empieza el horario no se cruza y se marca', () => {
    expect(turno('2026-11-09', '06:00', '08:00')).toBe(true);
  });

  it('RN-06b: un turno que empieza después del horario se marca', () => {
    expect(turno('2026-11-09', '15:00', '18:00')).toBe(true);
  });

  it('RN-06b: un turno abierto se evalúa con su entrada', () => {
    expect(turno('2026-11-09', '09:00', null)).toBe(false);
    expect(turno('2026-11-09', '03:00', null)).toBe(true);
    expect(turno('2026-11-14', '09:00', null)).toBe(true);
  });

  it('RN-06b: un turno que cruza medianoche se evalúa contra el horario del día de entrada', () => {
    const entrada = instanteLocal('2026-11-09', '13:00');
    const salida = instanteLocal('2026-11-10', '02:00');

    expect(turnoFueraDeHorario({ entrada, salida, ...horario })).toBe(false);
  });

  it('RN-06b: sin horario pactado nunca se marca', () => {
    const vacio = { diasPactados: [], horaEntrada: null, horaSalida: null };

    expect(turno('2026-11-14', '02:00', '04:00', vacio)).toBe(false);
  });

  it('RN-06b: con días pero sin horas solo se revisa el día', () => {
    const soloDias = { horaEntrada: null, horaSalida: null };

    expect(turno('2026-11-09', '02:00', '04:00', soloDias)).toBe(false);
    expect(turno('2026-11-14', '09:00', '10:00', soloDias)).toBe(true);
  });

  it('RN-15: usa el día y la hora de Monterrey, no UTC', () => {
    // Monday 22:30 in Monterrey is already Tuesday in UTC; the day to check is Monday.
    expect(turno('2026-11-09', '22:30', '23:30', { diasPactados: [1], horaEntrada: '22:00', horaSalida: '23:59' })).toBe(false);
  });
});
