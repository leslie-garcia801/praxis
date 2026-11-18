// Pilot metrics report (specs §12). Read-only: it only runs SELECTs; the definitions live in domain/metricasPiloto.ts.
//
// Population: case files of the students that match the filters (campus, carrera, semestre, grupo, tipo) whose estado
// is EN_PROCESO, SUSPENDIDO or FINALIZADO now, with fechaInicio <= hasta and (no fechaTermino or fechaTermino >= desde).
// The data keeps no estado history, so this is the closest approximation to "was EN_PROCESO at some point in the range".
//
// Notebook shifts (RF-17a, RN-19: origen LIBRETA) are copied from paper, not scanned, so they are excluded from metrics 1
// and 3 (and from the CSV columns dias, turnos and turnosIncompletos). Metric 2 still counts notebook weeks: it measures
// how fast the supervisor validates.
import {
  clasificarTurno,
  clasificarValidacion,
  diasRegistradosEnSemana,
  resumirRegistro,
  resumirTurnos,
  resumirValidacion,
  semanasCompletas,
  DIAS_MINIMOS_SEMANA,
  type ClaseTurno,
  type ClaseValidacion,
  type Meta,
  type ResumenTurnos,
  type ResumenValidacion,
} from '../../domain/metricasPiloto.js';
import { prisma } from '../../lib/prisma.js';
import { fechaLocal, instanteLocal, sumarDias, type FechaISO } from '../../lib/tiempo.js';
import type { ArgsMetricas } from './metricasPiloto.args.js';

/** Bad input (unknown carrera or plantel): the script prints it and exits with code 2. */
export class ErrorUsoMetricas extends Error {}

export type AlumnoBajo = { alumno: string; matricula: string | null; tipo: string; dias: number };
export type SemanaRegistro = { semana: FechaISO; total: number; cumplen: number; bajo: AlumnoBajo[] };

export type FilaCsv = {
  alumno: string;
  matricula: string | null;
  tipo: string;
  semana: FechaISO;
  dias: number;
  cumple: boolean;
  enviadas: number;
  validadasATiempo: number;
  turnos: number;
  turnosIncompletos: number;
};

export type ReportePiloto = {
  desde: FechaISO;
  hasta: FechaISO;
  hoy: FechaISO;
  plantel: { id: string; nombre: string };
  filtros: { carrera?: string; semestre?: number; grupo?: string; tipo?: string };
  expedientes: number;
  alumnos: number;
  registro: { metrica: Meta; semanas: SemanaRegistro[] };
  validacion: ResumenValidacion;
  turnos: ResumenTurnos;
  /** Notebook shifts (origen LIBRETA) in the range, left out of metrics 1 and 3. */
  turnosLibretaExcluidos: number;
  filas: FilaCsv[];
};

const ESTADOS_POBLACION = ['EN_PROCESO', 'SUSPENDIDO', 'FINALIZADO'] as const;

const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

const fechaDb = (f: FechaISO) => new Date(`${f}T00:00:00.000Z`);
const isoDb = (d: Date) => d.toISOString().slice(0, 10);

async function resolverPlantel(plantelId: string | undefined) {
  const planteles = await prisma.plantel.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } });
  if (plantelId) {
    const plantel = planteles.find((p) => p.id === plantelId);
    if (!plantel) throw new ErrorUsoMetricas(`No existe el plantel "${plantelId}".`);
    return plantel;
  }
  if (planteles.length === 1) return planteles[0]!;
  if (planteles.length === 0) throw new ErrorUsoMetricas('No hay planteles en la base de datos.');
  const lista = planteles.map((p) => `  - ${p.id}  ${p.nombre}`).join('\n');
  throw new ErrorUsoMetricas(`Hay más de un plantel; indica uno con --plantel <id>:\n${lista}`);
}

async function resolverCarreras(nombre: string) {
  const clave = normalizar(nombre);
  const carreras = await prisma.carrera.findMany({ select: { id: true, nombre: true } });
  const ids = carreras.filter((c) => normalizar(c.nombre) === clave).map((c) => c.id);
  if (ids.length === 0) {
    const lista = carreras.map((c) => `  - ${c.nombre}`).join('\n');
    throw new ErrorUsoMetricas(`No existe la carrera "${nombre}". Carreras disponibles:\n${lista}`);
  }
  return ids;
}

export async function generarReportePiloto(args: ArgsMetricas, ahora: Date): Promise<ReportePiloto> {
  const { desde, hasta } = args;
  const hoy = fechaLocal(ahora);
  const plantel = await resolverPlantel(args.plantel);
  const carreraIds = args.carrera ? await resolverCarreras(args.carrera) : undefined;

  const expedientes = await prisma.expediente.findMany({
    where: {
      estado: { in: [...ESTADOS_POBLACION] },
      ...(args.tipo && { tipo: args.tipo }),
      fechaInicio: { lte: fechaDb(hasta) },
      OR: [{ fechaTermino: null }, { fechaTermino: { gte: fechaDb(desde) } }],
      alumno: {
        usuario: { plantelId: plantel.id },
        ...(carreraIds && { carreraId: { in: carreraIds } }),
        ...(args.semestre !== undefined && { semestre: args.semestre }),
        ...(args.grupo && { grupo: { equals: args.grupo, mode: 'insensitive' as const } }),
      },
    },
    select: {
      id: true,
      tipo: true,
      fechaInicio: true,
      alumno: {
        select: { id: true, nombre: true, apellidoPaterno: true, apellidoMaterno: true, usuario: { select: { username: true } } },
      },
    },
  });
  const ids = expedientes.map((e) => e.id);

  // Calendar days of the range in Monterrey time: [desde 00:00, hasta + 1 day 00:00).
  const inicioRango = instanteLocal(desde, '00:00');
  const finRango = instanteLocal(sumarDias(hasta, 1), '00:00');

  const asistencias = ids.length
    ? await prisma.asistencia.findMany({
        where: { expedienteId: { in: ids }, entrada: { gte: inicioRango, lt: finRango } },
        select: { expedienteId: true, entrada: true, estado: true, origen: true },
      })
    : [];
  const semanas = ids.length
    ? await prisma.semanaBitacora.findMany({
        where: {
          expedienteId: { in: ids },
          OR: [{ enviadaEn: { gte: inicioRango, lt: finRango } }, { semanaInicio: { gte: fechaDb(desde), lte: fechaDb(hasta) } }],
        },
        select: { expedienteId: true, semanaInicio: true, estado: true, enviadaEn: true, validadoEn: true },
      })
    : [];

  // RN-19: only QR shifts feed metrics 1 and 3.
  const turnosQr = asistencias.filter((a) => a.origen !== 'LIBRETA');
  const turnosLibretaExcluidos = asistencias.length - turnosQr.length;

  const asistenciasDe = new Map<string, typeof asistencias>();
  for (const a of turnosQr) asistenciasDe.set(a.expedienteId, [...(asistenciasDe.get(a.expedienteId) ?? []), a]);

  // Metric 2: weeks sent within the range.
  const claseDeSemana = (s: (typeof semanas)[number]): ClaseValidacion | null =>
    s.enviadaEn && s.enviadaEn >= inicioRango && s.enviadaEn < finRango
      ? clasificarValidacion({ estado: s.estado, enviadaEn: s.enviadaEn, validadoEn: s.validadoEn }, ahora)
      : null;
  const clasesValidacion = semanas.map(claseDeSemana).filter((c): c is ClaseValidacion => c !== null);

  // Metric 3: every shift of the population whose entry falls in the range.
  const claseTurno = (a: (typeof asistencias)[number]): ClaseTurno => clasificarTurno(a, hoy);
  const clasesTurno = turnosQr.map(claseTurno);

  // Metric 1 and CSV: one row per student-week.
  const filas: FilaCsv[] = [];
  const porSemana = new Map<FechaISO, SemanaRegistro>();
  for (const e of expedientes) {
    const nombre = [e.alumno.nombre, e.alumno.apellidoPaterno, e.alumno.apellidoMaterno].filter(Boolean).join(' ');
    const matricula = e.alumno.usuario.username;
    const turnos = asistenciasDe.get(e.id) ?? [];
    const semanasDe = semanas.filter((s) => s.expedienteId === e.id);
    for (const lunes of semanasCompletas(desde, hasta, e.fechaInicio ? isoDb(e.fechaInicio) : null)) {
      const domingo = sumarDias(lunes, 6);
      const dias = diasRegistradosEnSemana(turnos.map((t) => t.entrada), lunes);
      const clases = turnos
        .filter((t) => fechaLocal(t.entrada) >= lunes && fechaLocal(t.entrada) <= domingo)
        .map(claseTurno)
        .filter((c) => c !== 'ABIERTO_HOY');
      const bitacora = semanasDe.find((s) => isoDb(s.semanaInicio) === lunes);
      const clase = bitacora?.enviadaEn ? clasificarValidacion({ estado: bitacora.estado, enviadaEn: bitacora.enviadaEn, validadoEn: bitacora.validadoEn }, ahora) : null;
      filas.push({
        alumno: nombre,
        matricula,
        tipo: e.tipo,
        semana: lunes,
        dias,
        cumple: dias >= DIAS_MINIMOS_SEMANA,
        enviadas: clase ? 1 : 0,
        validadasATiempo: clase === 'VALIDADA_A_TIEMPO' ? 1 : 0,
        turnos: clases.length,
        turnosIncompletos: clases.filter((c) => c === 'INCOMPLETO').length,
      });
      const resumen = porSemana.get(lunes) ?? { semana: lunes, total: 0, cumplen: 0, bajo: [] };
      resumen.total++;
      if (dias >= DIAS_MINIMOS_SEMANA) resumen.cumplen++;
      else resumen.bajo.push({ alumno: nombre, matricula, tipo: e.tipo, dias });
      porSemana.set(lunes, resumen);
    }
  }

  filas.sort((a, b) => a.alumno.localeCompare(b.alumno, 'es') || a.tipo.localeCompare(b.tipo) || a.semana.localeCompare(b.semana));
  const semanasRegistro = [...porSemana.values()].sort((a, b) => a.semana.localeCompare(b.semana));
  for (const s of semanasRegistro) s.bajo.sort((a, b) => a.alumno.localeCompare(b.alumno, 'es'));

  return {
    desde,
    hasta,
    hoy,
    plantel,
    filtros: { carrera: args.carrera, semestre: args.semestre, grupo: args.grupo, tipo: args.tipo },
    expedientes: expedientes.length,
    alumnos: new Set(expedientes.map((e) => e.alumno.id)).size,
    registro: { metrica: resumirRegistro(filas.map((f) => f.dias)), semanas: semanasRegistro },
    validacion: resumirValidacion(clasesValidacion),
    turnos: resumirTurnos(clasesTurno),
    turnosLibretaExcluidos,
    filas,
  };
}
