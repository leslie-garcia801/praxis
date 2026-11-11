// Decision rules for scanning attendance (RF-14, RN-07, RN-08, RN-13, RN-14).
// Pure functions: no Express, no Prisma.

import { fechaLocal, ZONA_APP, type FechaISO } from '../lib/tiempo.js';

/** RN-14: offline records are accepted when they arrive within this window. */
export const VENTANA_SIN_CONEXION_MS = 72 * 3_600_000;

/** Tolerance for a device clock slightly ahead of the server. */
export const TOLERANCIA_FUTURO_MS = 5 * 60_000;

export type ResultadoInstante = { ok: true; instante: Date } | { ok: false; motivo: 'HORA_FUTURA' | 'HORA_ANTIGUA' };

type ParametrosInstante = { sinConexion: boolean; hora: Date | undefined; ahora: Date };

/** RN-14: online scans use the server clock; offline scans use the device clock inside the allowed window. */
export function resolverInstante({ sinConexion, hora, ahora }: ParametrosInstante): ResultadoInstante {
  if (!sinConexion || !hora) return { ok: true, instante: ahora };
  const diferencia = ahora.getTime() - hora.getTime();
  if (diferencia > VENTANA_SIN_CONEXION_MS) return { ok: false, motivo: 'HORA_ANTIGUA' };
  if (-diferencia > TOLERANCIA_FUTURO_MS) return { ok: false, motivo: 'HORA_FUTURA' };
  return { ok: true, instante: hora };
}

export type Decision =
  | { tipo: 'ENTRADA'; cerrarAnterior: boolean }
  | { tipo: 'SALIDA' }
  | { tipo: 'RECHAZO'; motivo: 'ESCANEO_ANTERIOR_AL_TURNO' };

/**
 * RN-07 / RN-08: no open shift -> entry; open shift of the same local day -> exit;
 * open shift of an earlier local day -> it is closed as INCOMPLETA and the scan is a new entry.
 */
export function decidirAccion(
  turnoAbierto: { entrada: Date } | null,
  instante: Date,
  zona: string = ZONA_APP,
): Decision {
  if (!turnoAbierto) return { tipo: 'ENTRADA', cerrarAnterior: false };
  if (instante <= turnoAbierto.entrada) return { tipo: 'RECHAZO', motivo: 'ESCANEO_ANTERIOR_AL_TURNO' };
  if (fechaLocal(turnoAbierto.entrada, zona) < fechaLocal(instante, zona)) return { tipo: 'ENTRADA', cerrarAnterior: true };
  return { tipo: 'SALIDA' };
}

export type MotivoRechazoExpediente = 'EXPEDIENTE_SUSPENDIDO' | 'EXPEDIENTE_NO_ACTIVO' | 'ANTES_DE_FECHA_INICIO';

type ParametrosExpediente = {
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'SUSPENDIDO' | 'FINALIZADO' | 'CANCELADO';
  fechaInicio: FechaISO | null;
  fechaEscaneo: FechaISO;
};

/**
 * RN-13 and case file state: only EN_PROCESO accepts attendance. Before the start date nothing is
 * registered; there is no check against the end date (the state decides, decision 2026-11-10).
 */
export function motivoRechazoExpediente({ estado, fechaInicio, fechaEscaneo }: ParametrosExpediente): MotivoRechazoExpediente | null {
  if (estado === 'SUSPENDIDO') return 'EXPEDIENTE_SUSPENDIDO';
  if (estado !== 'EN_PROCESO') return 'EXPEDIENTE_NO_ACTIVO';
  if (fechaInicio && fechaEscaneo < fechaInicio) return 'ANTES_DE_FECHA_INICIO';
  return null;
}
