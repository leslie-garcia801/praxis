import { fechaLocal } from '../lib/tiempo.js';
import type { EstadoTurno } from './horas.js';

type EstadoSemana = 'BORRADOR' | 'ENVIADA' | 'VALIDADA' | 'RECHAZADA';
type EstadoExpediente = 'PENDIENTE' | 'EN_PROCESO' | 'SUSPENDIDO' | 'FINALIZADO' | 'CANCELADO';

// Weeks the supervisor has not signed yet: changing their hours does not alter a validation.
export const ESTADOS_SEMANA_CORREGIBLES: readonly EstadoSemana[] = ['BORRADOR', 'RECHAZADA'];
// Same as the case files that still send weeks (RN-13: a suspended student keeps their record).
export const ESTADOS_EXPEDIENTE_CORREGIBLES: readonly EstadoExpediente[] = ['EN_PROCESO', 'SUSPENDIDO'];

export type PropuestaCorreccion = {
  estadoTurno: EstadoTurno;
  // null when the shift has no logbook week.
  estadoSemana: EstadoSemana | null;
  estadoExpediente: EstadoExpediente;
  entradaOriginal: Date;
  salidaOriginal: Date | null;
  entradaNueva: Date;
  salidaNueva: Date;
  ahora: Date;
};

export type MotivoRechazoCorreccion =
  | 'TURNO_NO_CORREGIBLE'
  | 'SEMANA_NO_CORREGIBLE'
  | 'EXPEDIENTE_NO_ACTIVO'
  | 'ENTRADA_OTRO_DIA'
  | 'SALIDA_ANTERIOR_A_ENTRADA'
  | 'HORA_FUTURA'
  | 'CORRECCION_SIN_CAMBIOS';

/** Whether the shift itself can receive a correction request, regardless of the proposed times. */
export function turnoCorregible({
  estadoTurno,
  estadoSemana,
  estadoExpediente,
}: Pick<PropuestaCorreccion, 'estadoTurno' | 'estadoSemana' | 'estadoExpediente'>): MotivoRechazoCorreccion | null {
  // An open shift is closed by the next scan (RN-07, RN-08).
  if (estadoTurno === 'ABIERTA') return 'TURNO_NO_CORREGIBLE';
  if (estadoSemana !== null && !ESTADOS_SEMANA_CORREGIBLES.includes(estadoSemana)) return 'SEMANA_NO_CORREGIBLE';
  if (!ESTADOS_EXPEDIENTE_CORREGIBLES.includes(estadoExpediente)) return 'EXPEDIENTE_NO_ACTIVO';
  return null;
}

/**
 * RF-17: checks a correction proposed by the student (team decisions, task 0037):
 * - INCOMPLETA and CERRADA shifts can be corrected; ABIERTA cannot.
 * - Not in a week already sent or validated, so a supervisor's signature never changes underneath.
 * - The entry stays on the same local day (RN-15), so the shift keeps its week; the exit may cross midnight.
 * - The exit is after the entry and not in the future.
 * Overlaps with other shifts are checked against the database by the caller.
 */
export function motivoRechazoCorreccion(p: PropuestaCorreccion): MotivoRechazoCorreccion | null {
  const motivoTurno = turnoCorregible(p);
  if (motivoTurno) return motivoTurno;
  if (fechaLocal(p.entradaNueva) !== fechaLocal(p.entradaOriginal)) return 'ENTRADA_OTRO_DIA';
  if (p.salidaNueva <= p.entradaNueva) return 'SALIDA_ANTERIOR_A_ENTRADA';
  if (p.salidaNueva > p.ahora) return 'HORA_FUTURA';
  if (
    p.estadoTurno === 'CERRADA' &&
    p.entradaNueva.getTime() === p.entradaOriginal.getTime() &&
    p.salidaNueva.getTime() === p.salidaOriginal?.getTime()
  ) {
    return 'CORRECCION_SIN_CAMBIOS';
  }
  return null;
}
