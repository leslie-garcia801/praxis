import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { fechaLocal, inicioSemana, sumarDias } from '../../lib/tiempo.js';
import type { Prisma, SemanaBitacora } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../middleware/auth.js';
import { cargar } from '../expedientes/expedientes.service.js';
import { datosDeResolucion } from '../validacion/validacion.service.js';
import type { BitacoraInput, ResolverSemanaInput } from './semanas.schemas.js';

type Tx = Prisma.TransactionClient;

// RF-20: the student writes the logbook while the week is a draft or after it was rejected.
export const ESTADOS_EDITABLES = ['BORRADOR', 'RECHAZADA'] as const;
// RN-17: minimum length of the logbook, ignoring spaces at both ends.
export const MINIMO_ACTIVIDADES = 50;
// A case file that can still send weeks (RN-13: suspended students keep their logbook).
export const ESTADOS_QUE_ENVIAN = ['EN_PROCESO', 'SUSPENDIDO'] as const;

// RN-17: the logbook is valid when it has the minimum length ignoring spaces at both ends.
export const bitacoraValida = (actividades: string | null) => (actividades ?? '').trim().length >= MINIMO_ACTIVIDADES;

const conflicto = (code: string, message: string) => new AppError(409, code, message);

const aFecha = (d: Date) => d.toISOString().slice(0, 10);

// RN-15: a week is closed once its Sunday has passed in America/Monterrey.
export const semanaCerrada = (semanaInicio: Date, ahora: Date) => sumarDias(aFecha(semanaInicio), 6) < fechaLocal(ahora);

const aRespuesta = (s: SemanaBitacora) => ({
  id: s.id,
  semanaInicio: aFecha(s.semanaInicio),
  estado: s.estado,
  actividades: s.actividades,
  enviadaEn: s.enviadaEn,
  bitacoraActualizadaEn: s.bitacoraActualizadaEn,
});

// Only the student who owns the case file reaches the week (the routes already restrict the role). A week outside
// the plantel does not exist (404); another student's week is 403.
async function cargarSemana(db: Tx, user: AuthUser, id: string) {
  const semana = await db.semanaBitacora.findUnique({ where: { id } });
  if (!semana) throw AppError.notFound('La semana no existe.');
  const expediente = await cargar(db, user, semana.expedienteId);
  return { semana, expediente };
}

const noEditable = () => conflicto('SEMANA_NO_EDITABLE', 'La bitácora de esta semana ya no se puede editar.');

// RF-20: saves the logbook as a draft. `ahora` is injectable for tests.
export async function guardarBitacora(user: AuthUser, id: string, { actividades }: BitacoraInput, ahora: () => Date = () => new Date()) {
  const { semana } = await cargarSemana(prisma, user, id);
  if (!(ESTADOS_EDITABLES as readonly string[]).includes(semana.estado)) throw noEditable();

  // The state is part of the condition so a concurrent send cannot be overwritten.
  const { count } = await prisma.semanaBitacora.updateMany({
    where: { id, estado: { in: [...ESTADOS_EDITABLES] } },
    data: { actividades, bitacoraActualizadaEn: ahora() },
  });
  if (count === 0) throw noEditable();
  return aRespuesta(await prisma.semanaBitacora.findUniqueOrThrow({ where: { id } }));
}

// RF-20, RN-17, RF-29: sends a closed week to validation. `ahora` is injectable for tests.
export async function enviarSemana(user: AuthUser, id: string, ahora: () => Date = () => new Date()) {
  return prisma.$transaction(async (tx) => {
    const { semana, expediente } = await cargarSemana(tx, user, id);
    const momento = ahora();

    if (!(ESTADOS_QUE_ENVIAN as readonly string[]).includes(expediente.estado)) {
      throw conflicto('EXPEDIENTE_NO_ACTIVO', 'Tu expediente no está en proceso, por lo que no puedes enviar la semana.');
    }
    if (!semanaCerrada(semana.semanaInicio, momento)) {
      throw conflicto('SEMANA_EN_CURSO', 'La semana todavía no termina. Podrás enviarla a partir del lunes.');
    }
    if (!(ESTADOS_EDITABLES as readonly string[]).includes(semana.estado)) throw noEditable();
    if (!bitacoraValida(semana.actividades)) {
      throw conflicto('BITACORA_INCOMPLETA', `Escribe al menos ${MINIMO_ACTIVIDADES} caracteres en la bitácora antes de enviarla.`);
    }

    // The state is part of the condition so two sends cannot both succeed.
    const { count } = await tx.semanaBitacora.updateMany({
      where: { id, estado: { in: [...ESTADOS_EDITABLES] } },
      data: { estado: 'ENVIADA', enviadaEn: momento },
    });
    if (count === 0) throw noEditable();

    await tx.auditLog.create({
      data: {
        usuarioId: user.id,
        accion: 'ENVIAR_SEMANA',
        entidad: 'SemanaBitacora',
        entidadId: id,
        antes: { estado: semana.estado },
        despues: { estado: 'ENVIADA', enviadaEn: momento.toISOString() },
      },
    });
    return aRespuesta(await tx.semanaBitacora.findUniqueOrThrow({ where: { id } }));
  });
}

// RF-22: the office resolves a week the supervisor has not resolved. Only ENVIADA weeks can be resolved; the
// UPDATE is guarded by that state so it cannot race with the supervisor link. `ahora` is injectable for tests.
export async function resolverSemanaPorOficina(
  user: AuthUser,
  id: string,
  { accion, motivo, comentario }: ResolverSemanaInput,
  ahora: () => Date = () => new Date(),
) {
  const noEnviada = () => conflicto('SEMANA_NO_ENVIADA', 'Solo se puede validar o rechazar una semana enviada y pendiente de validación.');
  return prisma.$transaction(async (tx) => {
    const { semana } = await cargarSemana(tx, user, id);
    if (semana.estado !== 'ENVIADA') throw noEnviada();

    const validar = accion === 'VALIDAR';
    const momento = ahora();
    const datos = datosDeResolucion(validar ? { validar: true } : { validar: false, comentario: comentario! }, momento, user.id);
    const { count } = await tx.semanaBitacora.updateMany({ where: { id, estado: 'ENVIADA' }, data: datos });
    if (count === 0) throw noEnviada();

    await tx.auditLog.create({
      data: {
        usuarioId: user.id,
        accion: validar ? 'VALIDAR_SEMANA_VINCULACION' : 'RECHAZAR_SEMANA_VINCULACION',
        entidad: 'SemanaBitacora',
        entidadId: id,
        antes: { estado: 'ENVIADA' },
        despues: { estado: datos.estado, motivo, ...(validar ? {} : { comentario }), enNombreDelSupervisor: true },
      },
    });
    const actualizada = await tx.semanaBitacora.findUniqueOrThrow({ where: { id } });
    return {
      ...aRespuesta(actualizada),
      comentario: actualizada.comentario,
      validadoEn: actualizada.validadoEn,
      rechazadaEn: actualizada.rechazadaEn,
    };
  });
}

// RN-03: the case file the student is working on (same choice as the profile in `me`).
const ESTADOS_ACTIVOS = ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'] as const;

export type MotivoPendiente = 'RECHAZADA' | 'BITACORA_PENDIENTE' | 'BITACORA_SEMANA_ACTUAL';

// RF-18 (point 5): weeks of the active case file that need something from the student. `ahora` is injectable for tests.
export async function listarPendientes(user: AuthUser, ahora: () => Date = () => new Date()) {
  const expediente = await prisma.expediente.findFirst({
    where: { alumno: { usuarioId: user.id }, estado: { in: [...ESTADOS_ACTIVOS] } },
    orderBy: { creadoEn: 'desc' },
    select: { id: true },
  });
  if (!expediente) return [];

  const semanaActual = inicioSemana(fechaLocal(ahora()));
  const semanas = await prisma.semanaBitacora.findMany({
    where: { expedienteId: expediente.id, estado: { in: ['BORRADOR', 'RECHAZADA'] } },
    orderBy: { semanaInicio: 'desc' },
  });

  const pendientes: {
    id: string;
    semanaInicio: string;
    semanaFin: string;
    estado: SemanaBitacora['estado'];
    motivo: MotivoPendiente;
    comentario: string | null;
  }[] = [];
  for (const s of semanas) {
    const inicio = aFecha(s.semanaInicio);
    let motivo: MotivoPendiente;
    if (s.estado === 'RECHAZADA') motivo = 'RECHAZADA';
    else if (bitacoraValida(s.actividades)) continue;
    else motivo = inicio === semanaActual ? 'BITACORA_SEMANA_ACTUAL' : 'BITACORA_PENDIENTE';
    pendientes.push({
      id: s.id,
      semanaInicio: inicio,
      semanaFin: sumarDias(inicio, 6),
      estado: s.estado,
      motivo,
      comentario: s.estado === 'RECHAZADA' ? s.comentario : null,
    });
  }
  return pendientes;
}
