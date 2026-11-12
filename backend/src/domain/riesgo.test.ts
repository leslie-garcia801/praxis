import { describe, expect, it } from 'vitest';
import type { EstimacionTermino } from './horas.js';
import { evaluarRiesgo, limiteExpediente, MESES_SERVICIO_SOCIAL, sumarMeses } from './riesgo.js';

const estimada = (fecha: string): EstimacionTermino => ({ tipo: 'ESTIMADA', fecha, promedioMinutosDia: 240 });
const SIN_DATOS: EstimacionTermino = { tipo: 'SIN_DATOS' };

describe('sumarMeses', () => {
  it('adds calendar months', () => {
    expect(sumarMeses('2026-03-02', 6)).toBe('2026-09-02');
    expect(sumarMeses('2026-08-15', 6)).toBe('2027-02-15');
  });

  it('clamps to the last day of a shorter month', () => {
    expect(sumarMeses('2026-08-31', 6)).toBe('2027-02-28');
    expect(sumarMeses('2023-08-31', 6)).toBe('2024-02-29');
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('limiteExpediente', () => {
  it('RN-06a: prácticas ends at fechaTermino', () => {
    expect(limiteExpediente({ tipo: 'PRACTICAS', fechaInicio: '2026-03-02', fechaTermino: '2026-06-02' })).toBe('2026-06-02');
  });

  it('RN-06a: prácticas without fechaTermino cannot be evaluated', () => {
    expect(limiteExpediente({ tipo: 'PRACTICAS', fechaInicio: '2026-03-02', fechaTermino: null })).toBeNull();
  });

  it('RN-06a: servicio social is fechaInicio plus 6 months', () => {
    expect(MESES_SERVICIO_SOCIAL).toBe(6);
    expect(limiteExpediente({ tipo: 'SERVICIO_SOCIAL', fechaInicio: '2026-03-02', fechaTermino: null })).toBe('2026-09-02');
    expect(limiteExpediente({ tipo: 'SERVICIO_SOCIAL', fechaInicio: '2026-08-31', fechaTermino: null })).toBe('2027-02-28');
  });

  it('RN-06a: without fechaInicio there is no limit', () => {
    expect(limiteExpediente({ tipo: 'SERVICIO_SOCIAL', fechaInicio: null, fechaTermino: null })).toBeNull();
    expect(limiteExpediente({ tipo: 'PRACTICAS', fechaInicio: null, fechaTermino: '2026-06-02' })).toBeNull();
  });
});

describe('evaluarRiesgo', () => {
  const base = { tipo: 'PRACTICAS' as const, fechaInicio: '2026-03-02', fechaTermino: '2026-06-02', completado: false, hoy: '2026-05-01' };

  it('RN-06a: en riesgo si la fecha estimada pasa el límite', () => {
    expect(evaluarRiesgo({ ...base, estimacion: estimada('2026-06-03') })).toBe('EN_RIESGO');
  });

  it('RN-06a: en tiempo si la fecha estimada es el límite o antes', () => {
    expect(evaluarRiesgo({ ...base, estimacion: estimada('2026-06-02') })).toBe('EN_TIEMPO');
    expect(evaluarRiesgo({ ...base, estimacion: estimada('2026-05-20') })).toBe('EN_TIEMPO');
  });

  it('RN-06a: en riesgo si el límite ya pasó y no terminó', () => {
    expect(evaluarRiesgo({ ...base, hoy: '2026-06-03', estimacion: estimada('2026-06-10') })).toBe('EN_RIESGO');
    expect(evaluarRiesgo({ ...base, hoy: '2026-06-03', estimacion: SIN_DATOS })).toBe('EN_RIESGO');
  });

  it('RN-06a: el día del límite todavía no es riesgo por sí mismo', () => {
    expect(evaluarRiesgo({ ...base, hoy: '2026-06-02', estimacion: estimada('2026-06-02') })).toBe('EN_TIEMPO');
  });

  it('RN-06a: servicio social usa inicio + 6 meses', () => {
    const ss = { ...base, tipo: 'SERVICIO_SOCIAL' as const, fechaTermino: null };
    expect(evaluarRiesgo({ ...ss, estimacion: estimada('2026-09-02') })).toBe('EN_TIEMPO');
    expect(evaluarRiesgo({ ...ss, estimacion: estimada('2026-09-03') })).toBe('EN_RIESGO');
  });

  it('RN-16: sin datos suficientes no es riesgo', () => {
    expect(evaluarRiesgo({ ...base, estimacion: SIN_DATOS })).toBe('SIN_DATOS');
  });

  it('RN-06a: no evaluable sin límite', () => {
    expect(evaluarRiesgo({ ...base, fechaTermino: null, estimacion: estimada('2026-06-03') })).toBe('NO_EVALUABLE');
    expect(evaluarRiesgo({ ...base, tipo: 'SERVICIO_SOCIAL', fechaInicio: null, estimacion: SIN_DATOS })).toBe('NO_EVALUABLE');
  });

  it('RN-11: completado gana sobre cualquier otro resultado', () => {
    expect(evaluarRiesgo({ ...base, completado: true, hoy: '2026-07-01', estimacion: { tipo: 'COMPLETADO' } })).toBe('COMPLETADO');
    expect(evaluarRiesgo({ ...base, completado: true, fechaTermino: null, estimacion: SIN_DATOS })).toBe('COMPLETADO');
  });

  it('RN-16: horas registradas que ya cubren la meta (sin validar) no son riesgo', () => {
    expect(evaluarRiesgo({ ...base, estimacion: { tipo: 'COMPLETADO' } })).toBe('EN_TIEMPO');
  });
});
