import { describe, expect, it } from 'vitest';
import { faltantesParaConfirmar, horarioValido, periodoValido, semestreValido } from './expedientes.js';

describe('RN-01: semestre mínimo', () => {
  it.each([
    [4, false],
    [5, true],
    [6, true],
  ])('RN-01: semestre %i -> %s', (semestre, esperado) => {
    expect(semestreValido(semestre)).toBe(esperado);
  });
});

describe('RN-06: periodo de prácticas', () => {
  it('RN-06: la fecha de término debe ser posterior al inicio', () => {
    expect(periodoValido('2026-02-01', '2026-05-01')).toBe(true);
    expect(periodoValido('2026-02-01', '2026-02-01')).toBe(false);
    expect(periodoValido('2026-02-02', '2026-02-01')).toBe(false);
  });

  it('RN-06: sin una de las dos fechas no hay nada que comparar', () => {
    expect(periodoValido(null, '2026-05-01')).toBe(true);
    expect(periodoValido('2026-02-01', null)).toBe(true);
  });
});

describe('RN-06b: horario pactado', () => {
  it('RN-06b: la entrada debe ser antes que la salida', () => {
    expect(horarioValido('08:00', '12:00')).toBe(true);
    expect(horarioValido('12:00', '12:00')).toBe(false);
    expect(horarioValido('13:00', '08:00')).toBe(false);
  });

  it('RN-06b: sin una de las dos horas no hay nada que comparar', () => {
    expect(horarioValido(null, '12:00')).toBe(true);
    expect(horarioValido('08:00', null)).toBe(true);
  });
});

describe('RF-10: datos obligatorios para confirmar', () => {
  const completoServicio = { tipo: 'SERVICIO_SOCIAL', institucionId: 'i', supervisorId: 's', fechaInicio: '2026-02-01' } as const;
  const completoPracticas = {
    tipo: 'PRACTICAS',
    institucionId: 'i',
    supervisorId: 's',
    fechaInicio: '2026-02-01',
    fechaTermino: '2026-05-01',
    diasPactados: [1, 3],
    horaEntrada: '08:00',
    horaSalida: '12:00',
  } as const;

  it('RF-10: servicio social completo no tiene faltantes', () => {
    expect(faltantesParaConfirmar(completoServicio)).toEqual([]);
  });

  it('RF-10: servicio social sin institución, supervisor ni fecha de inicio', () => {
    expect(faltantesParaConfirmar({ tipo: 'SERVICIO_SOCIAL', institucionId: null, supervisorId: null, fechaInicio: null })).toEqual([
      'institucionId',
      'supervisorId',
      'fechaInicio',
    ]);
  });

  it('RF-10: prácticas completo no tiene faltantes', () => {
    expect(faltantesParaConfirmar(completoPracticas)).toEqual([]);
  });

  it('RF-10: prácticas pide también fecha de término y horario', () => {
    expect(
      faltantesParaConfirmar({ ...completoPracticas, fechaTermino: null, diasPactados: [], horaEntrada: null, horaSalida: null }),
    ).toEqual(['fechaTermino', 'diasPactados', 'horaEntrada', 'horaSalida']);
  });
});
