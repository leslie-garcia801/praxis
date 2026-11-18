// RF-17a, RN-19: hours already signed in the paper notebook (libreta) before the student used the app. The shifts
// become LIBRETA attendances in closed weeks that go straight to the supervisor through the weekly validation link.
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { inicioSemana, instanteLocal, sumarDias, type FechaISO } from '../../lib/tiempo.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../middleware/auth.js';
import { errorDeRestriccion, recalcularDias } from '../asistencias/asistencias.service.js';
import { ESTADOS_QUE_ENVIAN, cargarSemana, semanaCerrada } from './semanas.service.js';
import type { LibretaInput, TurnoLibretaInput } from './semanas.schemas.js';

type Tx = Prisma.TransactionClient;

const conflicto = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
const aFecha = (d: Date) => d.toISOString().slice(0, 10);
const lunesComoFecha = (inicio: FechaISO) => new Date(`${inicio}T00:00:00.000Z`);

// A row-level problem; `index` is the position of the shift in the request body.
type ErrorFila = { index: number; code: string; message: string };

type Fila = { index: number; id: string; fecha: FechaISO; semana: FechaISO; entrada: Date; salida: Date };

// Several row errors travel together in `details`; the top-level code and message are those of the first one.
function lanzarErrores(errores: ErrorFila[]): never {
  const primero = errores[0]!;
  throw conflicto(primero.code, primero.message, errores);
}

const MENSAJES = {
  HORARIO_INVALIDO: 'La hora de salida debe ser posterior a la de entrada dentro del mismo día.',
  ANTES_DE_FECHA_INICIO: 'La fecha es anterior al inicio de tu periodo.',
  SEMANA_NO_CERRADA: 'Solo puedes registrar libreta de semanas que ya terminaron. Usa el código QR para la semana en curso.',
  TURNO_FUERA_DE_SEMANA: 'La fecha no pertenece a la semana que estás corrigiendo.',
  ASISTENCIA_ID_EN_USO: 'El identificador del turno ya está en uso.',
  ASISTENCIA_TRASLAPADA: 'El horario se traslapa con otro turno.',
  SEMANA_CON_TURNOS_QR: 'Esa semana ya tiene turnos registrados con el código QR; no se pueden mezclar con la libreta.',
  SEMANA_DE_LIBRETA_EXISTENTE: 'Esa semana ya tiene horas de libreta registradas. Si el supervisor la rechaza, podrás corregirla.',
} as const;

// Checks that need no database: schedule, period start, closed week, repeated ids and overlaps among the shifts.
function validarFilas(turnos: TurnoLibretaInput[], fechaInicio: FechaISO, ahora: Date, semanaFija?: FechaISO) {
  const errores: ErrorFila[] = [];
  const validas: Fila[] = [];
  const vistos = new Set<string>();

  turnos.forEach((t, index) => {
    const error = (code: keyof typeof MENSAJES) => errores.push({ index, code, message: MENSAJES[code] });
    const semana = inicioSemana(t.fecha);
    if (t.salida <= t.entrada) return error('HORARIO_INVALIDO');
    if (t.fecha < fechaInicio) return error('ANTES_DE_FECHA_INICIO');
    if (semanaFija !== undefined && semana !== semanaFija) return error('TURNO_FUERA_DE_SEMANA');
    if (!semanaCerrada(lunesComoFecha(semana), ahora)) return error('SEMANA_NO_CERRADA');
    if (vistos.has(t.id)) return error('ASISTENCIA_ID_EN_USO');
    vistos.add(t.id);
    validas.push({ index, id: t.id, fecha: t.fecha, semana, entrada: instanteLocal(t.fecha, t.entrada), salida: instanteLocal(t.fecha, t.salida) });
  });
  if (errores.length > 0) lanzarErrores(errores);

  // RN-19: no overlap among the submitted shifts (the later one is reported).
  const porEntrada = [...validas].sort((a, b) => a.entrada.getTime() - b.entrada.getTime());
  let finMaximo = 0;
  for (const fila of porEntrada) {
    if (fila.entrada.getTime() < finMaximo) {
      errores.push({ index: fila.index, code: 'ASISTENCIA_TRASLAPADA', message: MENSAJES.ASISTENCIA_TRASLAPADA });
    }
    finMaximo = Math.max(finMaximo, fila.salida.getTime());
  }
  if (errores.length > 0) lanzarErrores(errores.sort((a, b) => a.index - b.index));
  return validas;
}

// Checks against stored data: ids already used and overlaps with shifts that exist. Shifts of `semanaPropia` (the
// week being replaced) are ignored because they are about to be deleted.
async function validarContraBase(tx: Tx, expedienteId: string, filas: Fila[], semanaPropia?: string) {
  const errores: ErrorFila[] = [];
  const usados = await tx.asistencia.findMany({
    where: { OR: [{ id: { in: filas.map((f) => f.id) } }, { salidaId: { in: filas.map((f) => f.id) } }] },
    select: { id: true, salidaId: true, semanaId: true },
  });
  const ocupados = new Set(usados.filter((a) => semanaPropia === undefined || a.semanaId !== semanaPropia).flatMap((a) => [a.id, a.salidaId]));
  for (const f of filas) {
    if (ocupados.has(f.id)) errores.push({ index: f.index, code: 'ASISTENCIA_ID_EN_USO', message: MENSAJES.ASISTENCIA_ID_EN_USO });
  }

  // Same rule as the asistencia_sin_traslape constraint: an open shift extends to infinity.
  const minEntrada = new Date(Math.min(...filas.map((f) => f.entrada.getTime())));
  const maxSalida = new Date(Math.max(...filas.map((f) => f.salida.getTime())));
  const existentes = (
    await tx.asistencia.findMany({
      where: { expedienteId, entrada: { lt: maxSalida }, OR: [{ salida: null }, { salida: { gt: minEntrada } }] },
      select: { entrada: true, salida: true, semanaId: true },
    })
  ).filter((a) => semanaPropia === undefined || a.semanaId !== semanaPropia);
  for (const f of filas) {
    const traslapa = existentes.some((a) => a.entrada < f.salida && (a.salida === null || a.salida > f.entrada));
    if (traslapa) errores.push({ index: f.index, code: 'ASISTENCIA_TRASLAPADA', message: MENSAJES.ASISTENCIA_TRASLAPADA });
  }
  if (errores.length > 0) lanzarErrores(errores);
}

const semanaConTurnos = { asistencias: { orderBy: { entrada: 'asc' } } } satisfies Prisma.SemanaBitacoraInclude;
type SemanaConTurnos = Prisma.SemanaBitacoraGetPayload<{ include: typeof semanaConTurnos }>;

const aSemanaLibreta = (s: SemanaConTurnos) => {
  const inicio = aFecha(s.semanaInicio);
  return {
    id: s.id,
    semanaInicio: inicio,
    semanaFin: sumarDias(inicio, 6),
    estado: s.estado,
    deLibreta: s.deLibreta,
    enviadaEn: s.enviadaEn,
    minutosAcreditables: s.asistencias.reduce((suma, a) => suma + (a.minutosAcreditables ?? 0), 0),
    turnos: s.asistencias.map((a) => ({
      id: a.id,
      entrada: a.entrada,
      salida: a.salida,
      origen: a.origen,
      minutosAcreditables: a.minutosAcreditables,
    })),
  };
};

const datosTurno = (f: Fila, expedienteId: string, semanaId: string) => ({
  id: f.id,
  expedienteId,
  entrada: f.entrada,
  salida: f.salida,
  estado: 'CERRADA' as const,
  origen: 'LIBRETA' as const,
  sinConexion: false,
  semanaId,
});

// A unique violation on the week (two concurrent requests for the same week) is a conflict, never a 500.
function errorDeConcurrencia(err: unknown): AppError | null {
  if (JSON.stringify(err).includes('semanas_bitacora') || String(err).includes('semanas_bitacora')) {
    return conflicto('SEMANA_DE_LIBRETA_EXISTENTE', MENSAJES.SEMANA_DE_LIBRETA_EXISTENTE);
  }
  return null;
}

const resumenSemanas = (semanas: SemanaConTurnos[]) => ({
  semanas: semanas.map((s) => ({
    semanaInicio: aFecha(s.semanaInicio),
    turnos: s.asistencias.length,
    minutos: s.asistencias.reduce((suma, a) => suma + (a.minutosAcreditables ?? 0), 0),
  })),
  turnos: semanas.reduce((suma, s) => suma + s.asistencias.length, 0),
  minutos: semanas.reduce((suma, s) => suma + s.asistencias.reduce((m, a) => m + (a.minutosAcreditables ?? 0), 0), 0),
});

// RF-17a, RN-04, RN-09, RN-19, RF-29: creates the closed weeks with the shifts of the notebook and sends them to
// validation. Everything happens in one transaction. `ahora` is injectable for tests.
export async function registrarLibreta(user: AuthUser, { turnos }: LibretaInput, ahora: () => Date = () => new Date()) {
  try {
    return await prisma.$transaction(async (tx) => {
      const momento = ahora();
      const alumno = await tx.alumno.findUnique({ where: { usuarioId: user.id }, select: { id: true } });
      if (!alumno) throw AppError.forbidden();
      const expediente = await tx.expediente.findFirst({ where: { alumnoId: alumno.id, estado: 'EN_PROCESO' } });
      if (!expediente || !expediente.fechaInicio) {
        throw conflicto('EXPEDIENTE_NO_ACTIVO', 'Tu expediente no está en proceso, por lo que no puedes registrar horas de libreta.');
      }
      if (!expediente.supervisorId) {
        throw conflicto('SIN_SUPERVISOR', 'Tu expediente todavía no tiene supervisor asignado. Acude a vinculación.');
      }

      const filas = validarFilas(turnos, aFecha(expediente.fechaInicio), momento);

      // RN-19: weeks that already exist cannot be mixed (QR) nor registered twice (libreta, edited with PUT).
      const inicios = [...new Set(filas.map((f) => f.semana))].sort();
      const existentes = await tx.semanaBitacora.findMany({
        where: { expedienteId: expediente.id, semanaInicio: { in: inicios.map(lunesComoFecha) } },
        select: { semanaInicio: true, deLibreta: true },
      });
      if (existentes.length > 0) {
        const porSemana = new Map(existentes.map((s) => [aFecha(s.semanaInicio), s.deLibreta]));
        lanzarErrores(
          filas
            .filter((f) => porSemana.has(f.semana))
            .map((f) => {
              const code = porSemana.get(f.semana) ? 'SEMANA_DE_LIBRETA_EXISTENTE' : 'SEMANA_CON_TURNOS_QR';
              return { index: f.index, code, message: MENSAJES[code] };
            }),
        );
      }
      await validarContraBase(tx, expediente.id, filas);

      const creadas: string[] = [];
      for (const inicio of inicios) {
        const semana = await tx.semanaBitacora.create({
          data: { expedienteId: expediente.id, semanaInicio: lunesComoFecha(inicio), estado: 'ENVIADA', deLibreta: true, enviadaEn: momento },
        });
        creadas.push(semana.id);
        await tx.asistencia.createMany({
          data: filas.filter((f) => f.semana === inicio).map((f) => datosTurno(f, expediente.id, semana.id)),
        });
      }

      // RN-04, RN-09: the credited minutes of every affected day.
      const fechas = filas.map((f) => f.fecha).sort();
      await recalcularDias(tx, expediente.id, fechas[0]!, fechas.at(-1)!, fechas[0]!);

      const semanas = await tx.semanaBitacora.findMany({ where: { id: { in: creadas } }, include: semanaConTurnos, orderBy: { semanaInicio: 'asc' } });
      await tx.auditLog.create({
        data: { usuarioId: user.id, accion: 'REGISTRAR_HORAS_LIBRETA', entidad: 'Expediente', entidadId: expediente.id, despues: resumenSemanas(semanas) },
      });
      return { semanas: semanas.map(aSemanaLibreta) };
    });
  } catch (err) {
    throw errorDeRestriccion(err) ?? errorDeConcurrencia(err) ?? err;
  }
}

// RF-17a, RN-19, RF-29: after a rejection the student replaces the shifts of a libreta week and sends it again. The
// comment and `rechazadaEn` of the rejection stay as history. `ahora` is injectable for tests.
export async function corregirLibreta(user: AuthUser, id: string, { turnos }: LibretaInput, ahora: () => Date = () => new Date()) {
  const noEditable = () => conflicto('SEMANA_NO_EDITABLE', 'Esta semana ya no se puede corregir porque no está rechazada.');
  try {
    return await prisma.$transaction(async (tx) => {
      const momento = ahora();
      const { semana, expediente } = await cargarSemana(tx, user, id);
      if (!semana.deLibreta) {
        throw conflicto('SEMANA_NO_DE_LIBRETA', 'Esta semana no se capturó desde la libreta. Corrige su bitácora o solicita la corrección de un turno.');
      }
      if (semana.estado !== 'RECHAZADA') throw noEditable();
      if (!(ESTADOS_QUE_ENVIAN as readonly string[]).includes(expediente.estado) || !expediente.fechaInicio) {
        throw conflicto('EXPEDIENTE_NO_ACTIVO', 'Tu expediente no está en proceso, por lo que no puedes corregir la semana.');
      }

      const inicio = aFecha(semana.semanaInicio);
      const filas = validarFilas(turnos, aFecha(expediente.fechaInicio), momento, inicio);
      await validarContraBase(tx, expediente.id, filas, id);

      // The state is part of the condition so a concurrent change cannot be overwritten.
      const { count } = await tx.semanaBitacora.updateMany({ where: { id, estado: 'RECHAZADA' }, data: { estado: 'ENVIADA', enviadaEn: momento } });
      if (count === 0) throw noEditable();

      const { count: anteriores } = await tx.asistencia.deleteMany({ where: { semanaId: id } });
      await tx.asistencia.createMany({ data: filas.map((f) => datosTurno(f, expediente.id, id)) });
      await recalcularDias(tx, expediente.id, inicio, sumarDias(inicio, 6), inicio);

      const actualizada = await tx.semanaBitacora.findUniqueOrThrow({ where: { id }, include: semanaConTurnos });
      await tx.auditLog.create({
        data: {
          usuarioId: user.id,
          accion: 'CORREGIR_HORAS_LIBRETA',
          entidad: 'SemanaBitacora',
          entidadId: id,
          antes: { estado: 'RECHAZADA', turnos: anteriores },
          despues: { estado: 'ENVIADA', enviadaEn: momento.toISOString(), ...resumenSemanas([actualizada]) },
        },
      });
      return aSemanaLibreta(actualizada);
    });
  } catch (err) {
    throw errorDeRestriccion(err) ?? err;
  }
}
