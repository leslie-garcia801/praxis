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

export type EstadoExpediente = 'PENDIENTE' | 'EN_PROCESO' | 'SUSPENDIDO' | 'FINALIZADO' | 'CANCELADO';
export type AccionEstado = 'SUSPENDER' | 'REACTIVAR' | 'CANCELAR';

const TRANSICIONES: Record<AccionEstado, { desde: readonly EstadoExpediente[]; hasta: EstadoExpediente }> = {
  SUSPENDER: { desde: ['EN_PROCESO'], hasta: 'SUSPENDIDO' },
  REACTIVAR: { desde: ['SUSPENDIDO'], hasta: 'EN_PROCESO' },
  CANCELAR: { desde: ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'], hasta: 'CANCELADO' },
};

// RF-12: the state an action leaves the case file in, or null when the action is not allowed from `estado`.
export const transicionDeEstado = (accion: AccionEstado, estado: EstadoExpediente): EstadoExpediente | null =>
  TRANSICIONES[accion].desde.includes(estado) ? TRANSICIONES[accion].hasta : null;

// RN-12: only a running (or suspended) case file moves to another institution.
export const puedeTransferir = (estado: EstadoExpediente) => estado === 'EN_PROCESO' || estado === 'SUSPENDIDO';

// RN-03a: the second program is the other type.
export const tipoContrario = (tipo: TipoPrograma): TipoPrograma => (tipo === 'SERVICIO_SOCIAL' ? 'PRACTICAS' : 'SERVICIO_SOCIAL');

export const SEMESTRE_SEGUNDO_PROGRAMA = 6;

const ESTADOS_ACTIVOS: readonly EstadoExpediente[] = ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'];

export type ExpedienteResumen = { tipo: TipoPrograma; estado: EstadoExpediente; creadoEn: Date };

// RF-01, RN-03, RN-03a, RN-03b: whether the next program can be assigned to a student, and which one.
// The first program is the type of the oldest case file (a cancelled attempt that is repeated keeps the type);
// it must have ended in FINALIZADO. Returns the type to assign or the reason to skip the student.
export function decidirAsignacion(datos: {
  semestreAlumno: number;
  expedientes: readonly ExpedienteResumen[];
  alcance: readonly TipoPrograma[];
}): { tipo: TipoPrograma } | { motivo: string } {
  const { semestreAlumno, expedientes, alcance } = datos;
  if (expedientes.length === 0) return { motivo: 'El alumno no tiene un primer expediente.' };

  const primerTipo = [...expedientes].sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime())[0]!.tipo;
  if (!expedientes.some((e) => e.tipo === primerTipo && e.estado === 'FINALIZADO')) {
    return { motivo: 'El primer expediente del alumno aún no está finalizado.' };
  }
  if (expedientes.some((e) => ESTADOS_ACTIVOS.includes(e.estado))) {
    return { motivo: 'El alumno ya tiene un expediente activo.' };
  }
  const siguiente = tipoContrario(primerTipo);
  // A cancelled attempt of the other program does not block a new assignment (the active case is caught above).
  if (expedientes.some((e) => e.tipo === siguiente && e.estado === 'FINALIZADO')) {
    return { motivo: 'El alumno ya tiene un expediente del otro programa.' };
  }
  if (semestreAlumno < SEMESTRE_SEGUNDO_PROGRAMA) {
    return { motivo: `El alumno aún no está en ${SEMESTRE_SEGUNDO_PROGRAMA}.º semestre.` };
  }
  if (!alcance.includes(siguiente)) {
    return { motivo: 'El siguiente programa corresponde a la otra oficina de vinculación.' };
  }
  return { tipo: siguiente };
}
