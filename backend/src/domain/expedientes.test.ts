import { describe, expect, it } from 'vitest';
import {
  decidirAsignacion,
  faltantesParaConfirmar,
  horarioValido,
  periodoValido,
  puedeTransferir,
  semestreValido,
  tipoContrario,
  transicionDeEstado,
} from './expedientes.js';

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

describe('RF-12: transiciones de estado', () => {
  it.each([
    ['SUSPENDER', 'EN_PROCESO', 'SUSPENDIDO'],
    ['REACTIVAR', 'SUSPENDIDO', 'EN_PROCESO'],
    ['CANCELAR', 'PENDIENTE', 'CANCELADO'],
    ['CANCELAR', 'EN_PROCESO', 'CANCELADO'],
    ['CANCELAR', 'SUSPENDIDO', 'CANCELADO'],
  ] as const)('RF-12: %s desde %s -> %s', (accion, desde, hasta) => {
    expect(transicionDeEstado(accion, desde)).toBe(hasta);
  });

  it.each([
    ['SUSPENDER', 'PENDIENTE'],
    ['SUSPENDER', 'SUSPENDIDO'],
    ['SUSPENDER', 'FINALIZADO'],
    ['SUSPENDER', 'CANCELADO'],
    ['REACTIVAR', 'PENDIENTE'],
    ['REACTIVAR', 'EN_PROCESO'],
    ['REACTIVAR', 'FINALIZADO'],
    ['CANCELAR', 'FINALIZADO'],
    ['CANCELAR', 'CANCELADO'],
  ] as const)('RF-12: %s desde %s no se permite', (accion, desde) => {
    expect(transicionDeEstado(accion, desde)).toBeNull();
  });
});

describe('RN-12: transferir', () => {
  it.each([
    ['EN_PROCESO', true],
    ['SUSPENDIDO', true],
    ['PENDIENTE', false],
    ['FINALIZADO', false],
    ['CANCELADO', false],
  ] as const)('RN-12: desde %s -> %s', (estado, esperado) => {
    expect(puedeTransferir(estado)).toBe(esperado);
  });
});

describe('RN-03a: siguiente programa', () => {
  const base = { semestreAlumno: 6, alcance: ['SERVICIO_SOCIAL', 'PRACTICAS'] as ('SERVICIO_SOCIAL' | 'PRACTICAS')[] };
  const exp = (tipo: 'SERVICIO_SOCIAL' | 'PRACTICAS', estado: 'FINALIZADO' | 'EN_PROCESO' | 'CANCELADO' | 'PENDIENTE' | 'SUSPENDIDO', mes = 1) => ({
    tipo,
    estado,
    creadoEn: new Date(`2026-0${mes}-01T00:00:00Z`),
  });

  it('RN-03a: el tipo contrario', () => {
    expect(tipoContrario('SERVICIO_SOCIAL')).toBe('PRACTICAS');
    expect(tipoContrario('PRACTICAS')).toBe('SERVICIO_SOCIAL');
  });

  it('RN-03a: asigna el tipo contrario si el primero finalizó y está en 6.º', () => {
    expect(decidirAsignacion({ ...base, expedientes: [exp('SERVICIO_SOCIAL', 'FINALIZADO')] })).toEqual({ tipo: 'PRACTICAS' });
    expect(decidirAsignacion({ ...base, expedientes: [exp('PRACTICAS', 'FINALIZADO')] })).toEqual({ tipo: 'SERVICIO_SOCIAL' });
  });

  it('RN-03a: omite si no tiene expedientes', () => {
    expect(decidirAsignacion({ ...base, expedientes: [] })).toHaveProperty('motivo');
  });

  it('RN-03a: omite si el primero no está finalizado', () => {
    expect(decidirAsignacion({ ...base, expedientes: [exp('SERVICIO_SOCIAL', 'CANCELADO')] })).toHaveProperty('motivo');
  });

  it('RN-03: omite si tiene un expediente activo', () => {
    const r = decidirAsignacion({ ...base, expedientes: [exp('SERVICIO_SOCIAL', 'FINALIZADO'), exp('SERVICIO_SOCIAL', 'PENDIENTE', 2)] });
    expect(r).toHaveProperty('motivo');
  });

  it('RN-03a: omite si ya finalizó el tipo contrario', () => {
    const r = decidirAsignacion({ ...base, expedientes: [exp('SERVICIO_SOCIAL', 'FINALIZADO'), exp('PRACTICAS', 'FINALIZADO', 2)] });
    expect(r).toHaveProperty('motivo');
  });

  it('RN-03: omite si el tipo contrario está activo', () => {
    for (const estado of ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'] as const) {
      const r = decidirAsignacion({ ...base, expedientes: [exp('SERVICIO_SOCIAL', 'FINALIZADO'), exp('PRACTICAS', estado, 2)] });
      expect(r).toHaveProperty('motivo');
    }
  });

  it('RN-03a: un tipo contrario cancelado no bloquea: se asigna de nuevo', () => {
    const r = decidirAsignacion({ ...base, expedientes: [exp('SERVICIO_SOCIAL', 'FINALIZADO'), exp('PRACTICAS', 'CANCELADO', 2)] });
    expect(r).toEqual({ tipo: 'PRACTICAS' });
  });

  it('RN-03a: omite si el alumno está por debajo de 6.º semestre', () => {
    expect(decidirAsignacion({ ...base, semestreAlumno: 5, expedientes: [exp('SERVICIO_SOCIAL', 'FINALIZADO')] })).toHaveProperty('motivo');
  });

  it('RN-03b: omite si el tipo contrario no es de la oficina', () => {
    const r = decidirAsignacion({ semestreAlumno: 6, alcance: ['SERVICIO_SOCIAL'], expedientes: [exp('SERVICIO_SOCIAL', 'FINALIZADO')] });
    expect(r).toHaveProperty('motivo');
  });

  it('RN-03a: un primer programa cancelado y repetido del mismo tipo hasta finalizar cuenta como primero', () => {
    const r = decidirAsignacion({ ...base, expedientes: [exp('SERVICIO_SOCIAL', 'CANCELADO'), exp('SERVICIO_SOCIAL', 'FINALIZADO', 2)] });
    expect(r).toEqual({ tipo: 'PRACTICAS' });
  });
});
