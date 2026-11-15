import { describe, expect, it } from 'vitest';
import { instanteLocal } from '../lib/tiempo.js';
import { motivoRechazoCorreccion, type PropuestaCorreccion } from './correcciones.js';

const base: PropuestaCorreccion = {
  estadoTurno: 'INCOMPLETA',
  estadoSemana: 'BORRADOR',
  estadoExpediente: 'EN_PROCESO',
  entradaOriginal: instanteLocal('2026-11-10', '09:00'),
  salidaOriginal: instanteLocal('2026-11-10', '23:59'),
  entradaNueva: instanteLocal('2026-11-10', '09:00'),
  salidaNueva: instanteLocal('2026-11-10', '14:00'),
  ahora: instanteLocal('2026-11-12', '10:00'),
};

describe('motivoRechazoCorreccion (RF-17)', () => {
  it('RF-17, RN-08: acepta corregir la salida de un turno INCOMPLETA', () => {
    expect(motivoRechazoCorreccion(base)).toBeNull();
  });

  it('RF-17: acepta corregir un turno CERRADA con horas equivocadas', () => {
    expect(motivoRechazoCorreccion({ ...base, estadoTurno: 'CERRADA', salidaOriginal: instanteLocal('2026-11-10', '09:20') })).toBeNull();
  });

  it('RF-17: un turno ABIERTA no se corrige (se cierra con el siguiente escaneo)', () => {
    expect(motivoRechazoCorreccion({ ...base, estadoTurno: 'ABIERTA', salidaOriginal: null })).toBe('TURNO_NO_CORREGIBLE');
  });

  it('RF-17: no se corrige un turno de una semana enviada o validada', () => {
    expect(motivoRechazoCorreccion({ ...base, estadoSemana: 'ENVIADA' })).toBe('SEMANA_NO_CORREGIBLE');
    expect(motivoRechazoCorreccion({ ...base, estadoSemana: 'VALIDADA' })).toBe('SEMANA_NO_CORREGIBLE');
  });

  it('RF-17: sí se corrige en una semana rechazada o sin bitácora', () => {
    expect(motivoRechazoCorreccion({ ...base, estadoSemana: 'RECHAZADA' })).toBeNull();
    expect(motivoRechazoCorreccion({ ...base, estadoSemana: null })).toBeNull();
  });

  it('RF-17: solo con el expediente en proceso o suspendido', () => {
    expect(motivoRechazoCorreccion({ ...base, estadoExpediente: 'SUSPENDIDO' })).toBeNull();
    for (const estado of ['PENDIENTE', 'FINALIZADO', 'CANCELADO'] as const) {
      expect(motivoRechazoCorreccion({ ...base, estadoExpediente: estado })).toBe('EXPEDIENTE_NO_ACTIVO');
    }
  });

  it('RF-17, RN-15: la entrada corregida queda en el mismo día local del turno original', () => {
    expect(motivoRechazoCorreccion({ ...base, entradaNueva: instanteLocal('2026-11-10', '00:00') })).toBeNull();
    expect(motivoRechazoCorreccion({ ...base, entradaNueva: instanteLocal('2026-11-09', '23:30') })).toBe('ENTRADA_OTRO_DIA');
  });

  it('RF-17: la salida puede pasar la medianoche, pero debe ser posterior a la entrada', () => {
    expect(motivoRechazoCorreccion({ ...base, salidaNueva: instanteLocal('2026-11-11', '01:00') })).toBeNull();
    expect(motivoRechazoCorreccion({ ...base, salidaNueva: base.entradaNueva })).toBe('SALIDA_ANTERIOR_A_ENTRADA');
    expect(motivoRechazoCorreccion({ ...base, salidaNueva: instanteLocal('2026-11-10', '08:00') })).toBe('SALIDA_ANTERIOR_A_ENTRADA');
  });

  it('RF-17: la salida no puede estar en el futuro', () => {
    const ahora = instanteLocal('2026-11-10', '13:00');
    expect(motivoRechazoCorreccion({ ...base, ahora })).toBe('HORA_FUTURA');
    expect(motivoRechazoCorreccion({ ...base, ahora: base.salidaNueva })).toBeNull();
  });

  it('RF-17: rechaza una propuesta igual al turno actual', () => {
    expect(
      motivoRechazoCorreccion({ ...base, estadoTurno: 'CERRADA', salidaOriginal: base.salidaNueva }),
    ).toBe('CORRECCION_SIN_CAMBIOS');
  });
});
