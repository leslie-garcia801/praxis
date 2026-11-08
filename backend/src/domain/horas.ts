// Hour calculation rules (docs/specs.md section 8.4).
// Pure functions: no Express, no Prisma. Everything works in whole minutes;
// hours are only derived for display.

import {
  diasEntre,
  fechaLocal,
  inicioDelDiaSiguiente,
  instanteLocal,
  sumarDias,
  ZONA_APP,
  type FechaISO,
} from '../lib/tiempo.js';

/** RN-09: a shift shorter than this credits nothing (avoids accidental double scans). */
export const MINUTOS_MINIMOS_TURNO = 15;

/** RN-04: maximum creditable minutes per student per calendar day. */
export const TOPE_MINUTOS_DIA = 300;

/** RN-08: open shifts are auto-closed at this local time. */
export const HORA_CIERRE_AUTOMATICO = '23:59';

const MS_POR_MINUTO = 60_000;

export type EstadoTurno = 'ABIERTA' | 'CERRADA' | 'INCOMPLETA';

export type TurnoParaCalculo = {
  id: string;
  entrada: Date;
  salida: Date | null;
  estado: EstadoTurno;
};

export type ResumenDia = {
  /** Minutes worked that day by shifts that passed RN-09 (including the excess). */
  minutos: number;
  /** Minutes credited after the daily cap (RN-04). */
  acreditables: number;
};

export type ResultadoAcreditacion = {
  porTurno: Record<string, number>;
  porDia: Record<FechaISO, ResumenDia>;
};

/** RN-09: whole minutes of a shift, or 0 when it lasts less than the minimum. */
export function minutosTurno(entrada: Date, salida: Date): number {
  const minutos = Math.floor((salida.getTime() - entrada.getTime()) / MS_POR_MINUTO);
  return minutos < MINUTOS_MINIMOS_TURNO ? 0 : minutos;
}

type Segmento = { turnoId: string; fecha: FechaISO; inicio: Date; minutos: number };

/**
 * Splits a shift at each local midnight. Minutes are counted from the shift start so the
 * segments always add up to the shift's total whole minutes.
 */
function partirPorDia(turnoId: string, entrada: Date, salida: Date, zona: string): Segmento[] {
  const segmentos: Segmento[] = [];
  let inicio = entrada;
  let acumulado = 0;

  while (inicio < salida) {
    const medianoche = inicioDelDiaSiguiente(inicio, zona);
    const fin = medianoche < salida ? medianoche : salida;
    const hastaFin = Math.floor((fin.getTime() - entrada.getTime()) / MS_POR_MINUTO);
    segmentos.push({ turnoId, fecha: fechaLocal(inicio, zona), inicio, minutos: hastaFin - acumulado });
    acumulado = hastaFin;
    inicio = fin;
  }

  return segmentos;
}

/**
 * Creditable minutes per shift and per local day.
 * - Only CERRADA shifts count; ABIERTA and INCOMPLETA credit 0 (RN-08).
 * - RN-09 is evaluated on the whole shift, before splitting it.
 * - A shift crossing midnight is split between both days (team decision, task 0002).
 * - Each day is capped at 300 minutes, filled chronologically, so the excess is
 *   deducted from the last shift of the day (RN-04, specs 8.4).
 * - Days are grouped in the app time zone (RN-15); weekends count the same (RN-05).
 */
export function calcularMinutosAcreditables(
  turnos: readonly TurnoParaCalculo[],
  zona: string = ZONA_APP,
): ResultadoAcreditacion {
  const porTurno: Record<string, number> = {};
  const segmentos: Segmento[] = [];

  for (const turno of turnos) {
    porTurno[turno.id] = 0;
    if (turno.estado !== 'CERRADA' || turno.salida === null) continue;
    if (minutosTurno(turno.entrada, turno.salida) === 0) continue;
    segmentos.push(...partirPorDia(turno.id, turno.entrada, turno.salida, zona));
  }

  segmentos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  const porDia: Record<FechaISO, ResumenDia> = {};
  for (const s of segmentos) {
    const dia = (porDia[s.fecha] ??= { minutos: 0, acreditables: 0 });
    const acreditados = Math.min(s.minutos, TOPE_MINUTOS_DIA - dia.acreditables);
    dia.minutos += s.minutos;
    dia.acreditables += acreditados;
    porTurno[s.turnoId] = (porTurno[s.turnoId] ?? 0) + acreditados;
  }

  return { porTurno, porDia: ordenarPorFecha(porDia) };
}

function ordenarPorFecha<T>(registro: Record<FechaISO, T>): Record<FechaISO, T> {
  return Object.fromEntries(Object.entries(registro).sort(([a], [b]) => a.localeCompare(b)));
}

export type CierreAutomatico = {
  salida: Date;
  estado: 'INCOMPLETA';
  minutosAcreditables: 0;
};

/**
 * RN-08: closes a shift without exit at 23:59 (local) of its entry day, as INCOMPLETA
 * with 0 credited minutes until a correction is approved. If the entry happened after
 * 23:59, the exit is set one second after the entry to keep `salida > entrada`.
 */
export function cerrarTurnoAbierto(entrada: Date, zona: string = ZONA_APP): CierreAutomatico {
  const cierre = instanteLocal(fechaLocal(entrada, zona), HORA_CIERRE_AUTOMATICO, zona);
  const salida = cierre > entrada ? cierre : new Date(entrada.getTime() + 1000);
  return { salida, estado: 'INCOMPLETA', minutosAcreditables: 0 };
}

/** RN-16: rolling window, in calendar days (including today), used for the daily average. */
export const DIAS_VENTANA_PROMEDIO = 28;

/** RN-16: minimum days with credited minutes inside the window before estimating. */
export const DIAS_MINIMOS_PARA_ESTIMAR = 5;

export type EstimacionTermino =
  | { tipo: 'COMPLETADO' }
  | { tipo: 'SIN_DATOS' }
  | { tipo: 'ESTIMADA'; fecha: FechaISO; promedioMinutosDia: number };

export type ParametrosEstimacion = {
  /** Minutes still missing to reach the goal (the caller decides validated vs registered). */
  minutosFaltantes: number;
  /** Credited minutes per local day, for the whole history of the expediente. */
  minutosPorDia: Readonly<Record<FechaISO, number>>;
  hoy: Date;
  zona?: string;
};

/**
 * RN-16: estimated end date = today + missing minutes ÷ daily average.
 * - Daily average = credited minutes in the last 28 local days (including today)
 *   ÷ min(28, calendar days since the first-ever record, inclusive) (team decision, task 0002).
 * - Fewer than 5 days with credited minutes inside the window → SIN_DATOS.
 * - Days after today are ignored.
 */
export function estimarFechaTermino({
  minutosFaltantes,
  minutosPorDia,
  hoy,
  zona = ZONA_APP,
}: ParametrosEstimacion): EstimacionTermino {
  if (minutosFaltantes <= 0) return { tipo: 'COMPLETADO' };

  const fechaHoy = fechaLocal(hoy, zona);
  const inicioVentana = sumarDias(fechaHoy, -(DIAS_VENTANA_PROMEDIO - 1));

  const conRegistro = Object.entries(minutosPorDia)
    .filter(([fecha, minutos]) => minutos > 0 && fecha <= fechaHoy)
    .sort(([a], [b]) => a.localeCompare(b));

  const enVentana = conRegistro.filter(([fecha]) => fecha >= inicioVentana);
  if (enVentana.length < DIAS_MINIMOS_PARA_ESTIMAR) return { tipo: 'SIN_DATOS' };

  const primerRegistro = conRegistro[0]![0];
  const denominador = Math.min(DIAS_VENTANA_PROMEDIO, diasEntre(primerRegistro, fechaHoy) + 1);
  const totalVentana = enVentana.reduce((suma, [, minutos]) => suma + minutos, 0);

  // Integer arithmetic: ceil(faltantes ÷ (total ÷ denominador)) without floating-point drift.
  const diasRestantes = Math.ceil((minutosFaltantes * denominador) / totalVentana);

  return {
    tipo: 'ESTIMADA',
    fecha: sumarDias(fechaHoy, diasRestantes),
    promedioMinutosDia: Math.round(totalVentana / denominador),
  };
}
