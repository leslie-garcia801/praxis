// Pure rules for completing and confirming a case file (RF-10, RN-01, RN-06).
// No Express or Prisma. Calendar dates are "YYYY-MM-DD" strings, times are "HH:mm".

import type { TipoPrograma } from './oficinas.js';

export const SEMESTRE_MINIMO = 5;

// RN-01: only 5th semester or higher students can have a case file.
export const semestreValido = (semestre: number) => semestre >= SEMESTRE_MINIMO;

// RN-06: the end date must be after the start. With a missing date there is nothing to compare yet.
export function periodoValido(fechaInicio: string | null, fechaTermino: string | null) {
  if (!fechaInicio || !fechaTermino) return true;
  return fechaTermino > fechaInicio;
}

// RN-06b: the agreed schedule enters before it leaves ("HH:mm" strings compare in order).
export function horarioValido(horaEntrada: string | null, horaSalida: string | null) {
  if (!horaEntrada || !horaSalida) return true;
  return horaEntrada < horaSalida;
}

export type DatosConfirmacion = {
  tipo: TipoPrograma;
  institucionId: string | null;
  supervisorId: string | null;
  fechaInicio: string | null;
  fechaTermino?: string | null;
  diasPactados?: readonly number[];
  horaEntrada?: string | null;
  horaSalida?: string | null;
};

// RF-10: required data before the office can confirm. Practicas also needs its period and schedule.
export function faltantesParaConfirmar(datos: DatosConfirmacion): string[] {
  const faltantes: string[] = [];
  if (!datos.institucionId) faltantes.push('institucionId');
  if (!datos.supervisorId) faltantes.push('supervisorId');
  if (!datos.fechaInicio) faltantes.push('fechaInicio');
  if (datos.tipo === 'PRACTICAS') {
    if (!datos.fechaTermino) faltantes.push('fechaTermino');
    if (!datos.diasPactados || datos.diasPactados.length === 0) faltantes.push('diasPactados');
    if (!datos.horaEntrada) faltantes.push('horaEntrada');
    if (!datos.horaSalida) faltantes.push('horaSalida');
  }
  return faltantes;
}
