// RN-06a: is a case file at risk of not finishing in time? Pure logic: no Express or Prisma.
// Dates are calendar days ("YYYY-MM-DD", RN-15).

import type { EstimacionTermino } from './horas.js';
import type { TipoPrograma } from './oficinas.js';
import type { FechaISO } from '../lib/tiempo.js';

/** Open question #1 (specs §13): how long a servicio social lasts, counted from its start date. */
export const MESES_SERVICIO_SOCIAL = 6;

export type NivelRiesgo = 'EN_RIESGO' | 'EN_TIEMPO' | 'SIN_DATOS' | 'NO_EVALUABLE' | 'COMPLETADO';

/** Adds calendar months; when the target month is shorter the date clamps to its last day (Aug 31 + 6 → Feb 28/29). */
export function sumarMeses(fecha: FechaISO, meses: number): FechaISO {
  const [y, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = total % 12;
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes, Math.min(d, ultimoDia))).toISOString().slice(0, 10);
}

export type DatosLimite = {
  tipo: TipoPrograma;
  fechaInicio: FechaISO | null;
  fechaTermino: FechaISO | null;
};

/**
 * Last day the case file should finish by: fechaTermino for prácticas, fechaInicio + 6 months for servicio social.
 * Null when the data to compute it is missing (a prácticas case file needs both dates).
 */
export function limiteExpediente({ tipo, fechaInicio, fechaTermino }: DatosLimite): FechaISO | null {
  if (!fechaInicio) return null;
  if (tipo === 'PRACTICAS') return fechaTermino;
  return sumarMeses(fechaInicio, MESES_SERVICIO_SOCIAL);
}

export type ParametrosRiesgo = DatosLimite & {
  /** RN-16 estimate over the student's recent pace. */
  estimacion: EstimacionTermino;
  /** Validated minutes already reach the goal. */
  completado: boolean;
  /** Today's local calendar day. */
  hoy: FechaISO;
};

/**
 * RN-06a: at risk when the estimated end date falls after the limit, or the limit has passed and the student
 * has not finished. Missing a few days is not risk by itself (they lower the pace); with fewer than 5 days of
 * data the estimate does not exist, so it is SIN_DATOS (unless the limit already passed).
 */
export function evaluarRiesgo({ estimacion, completado, hoy, ...datos }: ParametrosRiesgo): NivelRiesgo {
  if (completado) return 'COMPLETADO';

  const limite = limiteExpediente(datos);
  if (!limite) return 'NO_EVALUABLE';
  if (hoy > limite) return 'EN_RIESGO';

  if (estimacion.tipo === 'SIN_DATOS') return 'SIN_DATOS';
  if (estimacion.tipo === 'ESTIMADA' && estimacion.fecha > limite) return 'EN_RIESGO';
  return 'EN_TIEMPO';
}
