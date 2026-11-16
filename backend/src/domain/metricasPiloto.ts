// Pilot success metrics (specs §12). Pure definitions: the service only loads data and calls these functions.
// Days are calendar days in America/Monterrey (RN-15); weeks run Monday to Sunday.
import { fechaLocal, inicioSemana, sumarDias, type FechaISO } from '../lib/tiempo.js';

export const DIAS_MINIMOS_SEMANA = 4;
export const DIAS_LIMITE_VALIDACION = 7; // RN-18
const MS_LIMITE_VALIDACION = DIAS_LIMITE_VALIDACION * 24 * 3_600_000;

// Goals as whole percentages (specs §12).
export const META_REGISTRO = 80;
export const META_VALIDACION = 70;
export const META_INCOMPLETOS = 10;

export type Meta = {
  numerador: number;
  denominador: number;
  /** One decimal; null when the denominator is 0 ("sin datos"). */
  porcentaje: number | null;
  meta: number;
  /** null when there is no data. */
  cumple: boolean | null;
};

/** Compares numerador/denominador against a goal in percent, with integer arithmetic (no rounding at the boundary). */
export function evaluarMeta(numerador: number, denominador: number, meta: number, sentido: 'MINIMO' | 'MAXIMO'): Meta {
  if (denominador === 0) return { numerador, denominador, porcentaje: null, meta, cumple: null };
  const cumple = sentido === 'MINIMO' ? numerador * 100 >= meta * denominador : numerador * 100 <= meta * denominador;
  return { numerador, denominador, porcentaje: Math.round((numerador / denominador) * 1000) / 10, meta, cumple };
}

// ---------------------------------------------------------------------------
// Metric 1: student-weeks with at least 4 registered days
// ---------------------------------------------------------------------------

/** Mondays of the weeks fully inside [desde, hasta] and on/after the case file start (a week starting before it is out). */
export function semanasCompletas(desde: FechaISO, hasta: FechaISO, fechaInicio: FechaISO | null): FechaISO[] {
  const inicio = fechaInicio && fechaInicio > desde ? fechaInicio : desde;
  let lunes = inicioSemana(inicio);
  if (lunes < inicio) lunes = sumarDias(lunes, 7);
  const semanas: FechaISO[] = [];
  while (sumarDias(lunes, 6) <= hasta) {
    semanas.push(lunes);
    lunes = sumarDias(lunes, 7);
  }
  return semanas;
}

/** Distinct local days of the week starting on `lunes` that have at least one attendance entry (any estado). */
export function diasRegistradosEnSemana(entradas: Date[], lunes: FechaISO): number {
  const domingo = sumarDias(lunes, 6);
  const dias = new Set<FechaISO>();
  for (const entrada of entradas) {
    const dia = fechaLocal(entrada);
    if (dia >= lunes && dia <= domingo) dias.add(dia);
  }
  return dias.size;
}

/** `dias` holds the registered days of each student-week. */
export function resumirRegistro(dias: number[]): Meta {
  const cumplen = dias.filter((d) => d >= DIAS_MINIMOS_SEMANA).length;
  return evaluarMeta(cumplen, dias.length, META_REGISTRO, 'MINIMO');
}

// ---------------------------------------------------------------------------
// Metric 2: weeks sent to the supervisor and validated within 7 days
// ---------------------------------------------------------------------------

export type ClaseValidacion = 'VALIDADA_A_TIEMPO' | 'VALIDADA_TARDE' | 'RECHAZADA' | 'PENDIENTE' | 'PENDIENTE_VENCIDA';

export type SemanaEnviada = {
  estado: 'BORRADOR' | 'ENVIADA' | 'VALIDADA' | 'RECHAZADA';
  enviadaEn: Date;
  validadoEn: Date | null;
};

/** A VALIDADA week without `validadoEn` cannot be proven on time, so it counts as late. */
export function clasificarValidacion(semana: SemanaEnviada, ahora: Date): ClaseValidacion {
  if (semana.estado === 'VALIDADA') {
    if (!semana.validadoEn) return 'VALIDADA_TARDE';
    return semana.validadoEn.getTime() - semana.enviadaEn.getTime() <= MS_LIMITE_VALIDACION ? 'VALIDADA_A_TIEMPO' : 'VALIDADA_TARDE';
  }
  if (semana.estado === 'RECHAZADA') return 'RECHAZADA';
  return ahora.getTime() - semana.enviadaEn.getTime() > MS_LIMITE_VALIDACION ? 'PENDIENTE_VENCIDA' : 'PENDIENTE';
}

export type ResumenValidacion = {
  enviadas: number;
  aTiempo: number;
  tarde: number;
  rechazadas: number;
  /** Includes the overdue ones. */
  pendientes: number;
  pendientesVencidas: number;
  metrica: Meta;
};

export function resumirValidacion(clases: ClaseValidacion[]): ResumenValidacion {
  const contar = (...c: ClaseValidacion[]) => clases.filter((x) => c.includes(x)).length;
  const aTiempo = contar('VALIDADA_A_TIEMPO');
  return {
    enviadas: clases.length,
    aTiempo,
    tarde: contar('VALIDADA_TARDE'),
    rechazadas: contar('RECHAZADA'),
    pendientes: contar('PENDIENTE', 'PENDIENTE_VENCIDA'),
    pendientesVencidas: contar('PENDIENTE_VENCIDA'),
    metrica: evaluarMeta(aTiempo, clases.length, META_VALIDACION, 'MINIMO'),
  };
}

// ---------------------------------------------------------------------------
// Metric 3: incomplete shifts
// ---------------------------------------------------------------------------

export type ClaseTurno = 'CERRADO' | 'INCOMPLETO' | 'ABIERTO_HOY';

/**
 * RN-08 closes an open shift lazily on the next scan, so an ABIERTA shift from a day before `hoy` is already
 * incomplete; one from today is not decided yet.
 */
export function clasificarTurno(turno: { estado: 'ABIERTA' | 'CERRADA' | 'INCOMPLETA'; entrada: Date }, hoy: FechaISO): ClaseTurno {
  if (turno.estado === 'INCOMPLETA') return 'INCOMPLETO';
  if (turno.estado === 'CERRADA') return 'CERRADO';
  return fechaLocal(turno.entrada) < hoy ? 'INCOMPLETO' : 'ABIERTO_HOY';
}

export type ResumenTurnos = { cerrados: number; incompletos: number; abiertosHoy: number; metrica: Meta };

export function resumirTurnos(clases: ClaseTurno[]): ResumenTurnos {
  const cerrados = clases.filter((c) => c === 'CERRADO').length;
  const incompletos = clases.filter((c) => c === 'INCOMPLETO').length;
  return {
    cerrados,
    incompletos,
    abiertosHoy: clases.length - cerrados - incompletos,
    metrica: evaluarMeta(incompletos, cerrados + incompletos, META_INCOMPLETOS, 'MAXIMO'),
  };
}
