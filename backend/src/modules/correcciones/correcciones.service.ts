import { motivoRechazoCorreccion, turnoCorregible, type MotivoRechazoCorreccion } from '../../domain/correcciones.js';
import { alcanceOficina } from '../../domain/oficinas.js';
import type { Prisma, SolicitudCorreccion } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { fechaLocal } from '../../lib/tiempo.js';
import type { AuthUser } from '../../middleware/auth.js';
import { errorDeRestriccion, recalcularDias } from '../asistencias/asistencias.service.js';
import { cargar } from '../expedientes/expedientes.service.js';
import type { ListarCorreccionesQuery, ResolverCorreccionInput, SolicitarCorreccionInput } from './correcciones.schemas.js';

type Tx = Prisma.TransactionClient;

const MENSAJES: Record<MotivoRechazoCorreccion, string> = {
  TURNO_NO_CORREGIBLE: 'Este turno sigue abierto. Registra tu salida en lugar de solicitar una corrección.',
  SEMANA_NO_CORREGIBLE: 'La semana de este turno ya se envió o se validó, por lo que no se puede corregir.',
  EXPEDIENTE_NO_ACTIVO: 'El expediente no está en proceso, por lo que el turno no se puede corregir.',
  ENTRADA_OTRO_DIA: 'La hora de entrada debe ser del mismo día del turno.',
  SALIDA_ANTERIOR_A_ENTRADA: 'La hora de salida debe ser posterior a la de entrada.',
  HORA_FUTURA: 'La hora de salida no puede estar en el futuro.',
  CORRECCION_SIN_CAMBIOS: 'Las horas propuestas son iguales a las del turno.',
};

const conflicto = (code: string, message: string) => new AppError(409, code, message);
const pendienteExistente = () =>
  conflicto('CORRECCION_PENDIENTE_EXISTENTE', 'Ya hay una solicitud de corrección pendiente para este turno.');
const noPendiente = () => conflicto('CORRECCION_NO_PENDIENTE', 'Esta solicitud de corrección ya fue resuelta.');
const traslapada = () => conflicto('ASISTENCIA_TRASLAPADA', 'Las horas propuestas se traslapan con otro turno ya registrado.');

export const aCorreccion = (s: SolicitudCorreccion) => ({
  id: s.id,
  asistenciaId: s.asistenciaId,
  entradaNueva: s.entradaNueva,
  salidaNueva: s.salidaNueva,
  motivo: s.motivo,
  estado: s.estado,
  comentario: s.comentario,
  creadoEn: s.creadoEn,
  resueltoEn: s.resueltoEn,
});

// Same rule as the asistencia_sin_traslape constraint (specs 8.3): an open shift extends to infinity.
async function hayTraslape(tx: Tx, expedienteId: string, asistenciaId: string, entrada: Date, salida: Date) {
  const otro = await tx.asistencia.findFirst({
    where: {
      expedienteId,
      id: { not: asistenciaId },
      entrada: { lt: salida },
      OR: [{ salida: null }, { salida: { gt: entrada } }],
    },
    select: { id: true },
  });
  return otro !== null;
}

// RF-17: the student asks the office to correct one of their shifts. Nothing changes on the shift until the office
// approves it. `ahora` is injectable for tests.
export async function solicitarCorreccion(
  user: AuthUser,
  asistenciaId: string,
  input: SolicitarCorreccionInput,
  ahora: () => Date = () => new Date(),
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const turno = await tx.asistencia.findUnique({ where: { id: asistenciaId }, include: { semana: { select: { estado: true } } } });
      if (!turno) throw AppError.notFound('El turno no existe.');
      // 404 outside the plantel, 403 for another student's shift (RN-03b).
      const expediente = await cargar(tx, user, turno.expedienteId);

      // RF-17a: a libreta shift is corrected together with its week, after the supervisor rejects it.
      if (turno.origen === 'LIBRETA') {
        throw conflicto('TURNO_DE_LIBRETA', 'Los turnos de libreta no se corrigen uno por uno. Si el supervisor rechaza la semana, corrígela con los turnos de tu libreta.');
      }

      const motivo = motivoRechazoCorreccion({
        estadoTurno: turno.estado,
        estadoSemana: turno.semana?.estado ?? null,
        estadoExpediente: expediente.estado,
        entradaOriginal: turno.entrada,
        salidaOriginal: turno.salida,
        entradaNueva: input.entradaNueva,
        salidaNueva: input.salidaNueva,
        ahora: ahora(),
      });
      if (motivo) throw conflicto(motivo, MENSAJES[motivo]);

      const pendiente = await tx.solicitudCorreccion.findFirst({ where: { asistenciaId, estado: 'PENDIENTE' }, select: { id: true } });
      if (pendiente) throw pendienteExistente();
      if (await hayTraslape(tx, turno.expedienteId, asistenciaId, input.entradaNueva, input.salidaNueva)) throw traslapada();

      const creada = await tx.solicitudCorreccion.create({
        data: { asistenciaId, entradaNueva: input.entradaNueva, salidaNueva: input.salidaNueva, motivo: input.motivo },
      });
      return aCorreccion(creada);
    });
  } catch (err) {
    // A concurrent request for the same shift hits the partial unique index.
    if (JSON.stringify(err).includes('una_correccion_pendiente') || String(err).includes('una_correccion_pendiente')) {
      throw pendienteExistente();
    }
    throw err;
  }
}

const incluirLista = {
  asistencia: {
    include: {
      expediente: {
        select: {
          id: true,
          tipo: true,
          alumno: { select: { nombre: true, apellidoPaterno: true, apellidoMaterno: true, usuario: { select: { username: true } } } },
        },
      },
    },
  },
} satisfies Prisma.SolicitudCorreccionInclude;
type FilaLista = Prisma.SolicitudCorreccionGetPayload<{ include: typeof incluirLista }>;

const aFilaLista = (s: FilaLista) => {
  const { asistencia: a } = s;
  const { alumno } = a.expediente;
  return {
    ...aCorreccion(s),
    turno: { id: a.id, entrada: a.entrada, salida: a.salida, estado: a.estado, minutosAcreditables: a.minutosAcreditables },
    expediente: { id: a.expediente.id, tipo: a.expediente.tipo },
    alumno: {
      nombre: [alumno.nombre, alumno.apellidoPaterno, alumno.apellidoMaterno].filter(Boolean).join(' '),
      matricula: alumno.usuario.username,
    },
  };
};

// RF-17, RN-03b: the office sees the requests of its office in its plantel (PENDIENTE by default, oldest first, as
// a queue); the student sees all of their own, newest first (RF-18 pending items).
export async function listarCorrecciones(user: AuthUser, { estado }: ListarCorreccionesQuery) {
  const esAlumno = user.rol === 'ALUMNO';
  const filtroEstado = estado ?? (esAlumno ? undefined : 'PENDIENTE');
  const filas = await prisma.solicitudCorreccion.findMany({
    where: {
      ...(filtroEstado && { estado: filtroEstado }),
      asistencia: {
        expediente: esAlumno
          ? { alumno: { usuarioId: user.id } }
          : { tipo: { in: alcanceOficina(user) }, alumno: { usuario: { plantelId: user.plantelId } } },
      },
    },
    include: incluirLista,
    orderBy: [{ creadoEn: filtroEstado === 'PENDIENTE' ? 'asc' : 'desc' }, { id: 'asc' }],
  });
  return filas.map(aFilaLista);
}

const datosTurno = (a: { entrada: Date; salida: Date | null; estado: string; minutosAcreditables: number | null }) => ({
  entrada: a.entrada.toISOString(),
  salida: a.salida?.toISOString() ?? null,
  estado: a.estado,
  minutosAcreditables: a.minutosAcreditables,
});

// RF-17, RN-04, RN-08, RF-29: the office approves or rejects a PENDIENTE request. Approving rewrites the shift as
// CERRADA with the proposed times and recomputes the credited minutes of the affected days; both actions are
// audited in the same transaction. `ahora` is injectable for tests.
export async function resolverCorreccion(
  user: AuthUser,
  id: string,
  { accion, comentario }: ResolverCorreccionInput,
  ahora: () => Date = () => new Date(),
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudCorreccion.findUnique({
        where: { id },
        include: { asistencia: { include: { semana: { select: { estado: true } } } } },
      });
      if (!solicitud) throw AppError.notFound('La solicitud de corrección no existe.');
      const turno = solicitud.asistencia;
      // 404 outside the plantel, 403 for the other office (RN-03b).
      const expediente = await cargar(tx, user, turno.expedienteId);
      if (solicitud.estado !== 'PENDIENTE') throw noPendiente();

      const momento = ahora();
      const aprobar = accion === 'APROBAR';

      if (aprobar) {
        // The week may have been sent, or another shift registered, since the request was made.
        const motivo = turnoCorregible({ estadoTurno: turno.estado, estadoSemana: turno.semana?.estado ?? null, estadoExpediente: expediente.estado });
        if (motivo) throw conflicto(motivo, MENSAJES[motivo]);
        if (await hayTraslape(tx, turno.expedienteId, turno.id, solicitud.entradaNueva, solicitud.salidaNueva)) throw traslapada();
      }

      // The state is part of the condition so two resolutions cannot both win.
      const { count } = await tx.solicitudCorreccion.updateMany({
        where: { id, estado: 'PENDIENTE' },
        data: {
          estado: aprobar ? 'APROBADA' : 'RECHAZADA',
          comentario: aprobar ? null : comentario!,
          resueltoPor: user.id,
          resueltoEn: momento,
        },
      });
      if (count === 0) throw noPendiente();

      if (aprobar) {
        await tx.asistencia.update({
          where: { id: turno.id },
          data: { entrada: solicitud.entradaNueva, salida: solicitud.salidaNueva, estado: 'CERRADA' },
        });
        const fechas = [turno.entrada, turno.salida ?? turno.entrada, solicitud.entradaNueva, solicitud.salidaNueva].map((d) => fechaLocal(d)).sort();
        await recalcularDias(tx, turno.expedienteId, fechas[0]!, fechas[fechas.length - 1]!, fechas[0]!);
        const corregido = await tx.asistencia.findUniqueOrThrow({ where: { id: turno.id } });
        await tx.auditLog.create({
          data: {
            usuarioId: user.id,
            accion: 'CORREGIR_ASISTENCIA',
            entidad: 'Asistencia',
            entidadId: turno.id,
            antes: datosTurno(turno),
            despues: { ...datosTurno(corregido), solicitudId: id, motivo: solicitud.motivo },
          },
        });
      } else {
        await tx.auditLog.create({
          data: {
            usuarioId: user.id,
            accion: 'RECHAZAR_CORRECCION',
            entidad: 'SolicitudCorreccion',
            entidadId: id,
            antes: { estado: 'PENDIENTE' },
            despues: { estado: 'RECHAZADA', comentario: comentario!, asistenciaId: turno.id },
          },
        });
      }

      return aCorreccion(await tx.solicitudCorreccion.findUniqueOrThrow({ where: { id } }));
    });
  } catch (err) {
    throw errorDeRestriccion(err) ?? err;
  }
}
