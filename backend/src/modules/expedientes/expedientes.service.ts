import {
  decidirAsignacion,
  faltantesParaConfirmar,
  horarioValido,
  periodoValido,
  puedeTransferir,
  semestreValido,
  transicionDeEstado,
  type AccionEstado,
} from '../../domain/expedientes.js';
import { estimarFechaTermino } from '../../domain/horas.js';
import { alcanceOficina, puedeAdministrarTipo, type TipoPrograma } from '../../domain/oficinas.js';
import { META_HORAS } from '../../domain/programas.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { fechaLocal } from '../../lib/tiempo.js';
import type { AuthUser } from '../../middleware/auth.js';
import { aRespuestaSupervisor } from '../supervisores/supervisores.service.js';
import {
  CAMPOS_SOLO_PRACTICAS,
  CAMPOS_SOLO_SERVICIO,
  type CambiarEstadoInput,
  type EditarExpedienteInput,
  type ListarExpedientesQuery,
  type TransferirExpedienteInput,
} from './expedientes.schemas.js';

type Db = Prisma.TransactionClient;

// RF-10: the office can still fix data while the case file is active; RN-12 covers moving it afterwards.
const ESTADOS_EDITABLES_OFICINA = ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'] as const;

const incluir = {
  alumno: {
    include: {
      carrera: { select: { nombre: true } },
      usuario: { select: { username: true, plantelId: true } },
    },
  },
  institucion: { select: { id: true, nombre: true } },
  supervisor: true,
} satisfies Prisma.ExpedienteInclude;
type ExpedienteCompleto = Prisma.ExpedienteGetPayload<{ include: typeof incluir }>;

// `@db.Date` columns are UTC midnight: they travel as plain calendar dates (RN-15).
const aFecha = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const desdeFecha = (f: string) => new Date(`${f}T00:00:00.000Z`);

function aRespuesta(e: ExpedienteCompleto, user: AuthUser) {
  return {
    id: e.id,
    tipo: e.tipo,
    estado: e.estado,
    semestre: e.semestre,
    metaHoras: e.metaHoras,
    minutosTransferidos: e.minutosTransferidos,
    departamento: e.departamento,
    fechaInicio: aFecha(e.fechaInicio),
    fechaTermino: aFecha(e.fechaTermino),
    diasPactados: e.diasPactados,
    horaEntrada: e.horaEntrada,
    horaSalida: e.horaSalida,
    programa: e.programa,
    subprograma: e.subprograma,
    creadoEn: e.creadoEn,
    alumno: {
      id: e.alumno.id,
      nombre: e.alumno.nombre,
      apellidoPaterno: e.alumno.apellidoPaterno,
      apellidoMaterno: e.alumno.apellidoMaterno,
      matricula: e.alumno.usuario.username,
      carrera: e.alumno.carrera.nombre,
      semestre: e.alumno.semestre,
      grupo: e.alumno.grupo,
      turno: e.alumno.turno,
    },
    institucion: e.institucion,
    supervisor: e.supervisor ? aRespuestaSupervisor(e.supervisor, user) : null,
    faltantes: faltantes(e),
  };
}

// What is still missing for the office to confirm (RF-10); empty when it is ready.
const faltantes = (e: ExpedienteCompleto) =>
  faltantesParaConfirmar({
    tipo: e.tipo,
    institucionId: e.institucionId,
    supervisorId: e.supervisorId,
    fechaInicio: aFecha(e.fechaInicio),
    fechaTermino: aFecha(e.fechaTermino),
    diasPactados: e.diasPactados,
    horaEntrada: e.horaEntrada,
    horaSalida: e.horaSalida,
  });

// Anything outside the plantel does not exist (404). Inside it: a student only reaches their own case file and
// vinculación only those of its office (RN-03b); everything else is 403.
export async function cargar(db: Db, user: AuthUser, id: string) {
  const expediente = await db.expediente.findUnique({ where: { id }, include: incluir });
  if (!expediente || expediente.alumno.usuario.plantelId !== user.plantelId) throw AppError.notFound('El expediente no existe.');

  const permitido =
    user.rol === 'ALUMNO' ? expediente.alumno.usuarioId === user.id : puedeAdministrarTipo(user, expediente.tipo);
  if (!permitido) throw AppError.forbidden();
  return expediente;
}

export async function obtenerExpediente(user: AuthUser, id: string) {
  return aRespuesta(await cargar(prisma, user, id), user);
}

// RF-10: what each office has to review. Scoped to the user's plantel and office (RN-03b).
export async function listarExpedientes(user: AuthUser, { estado }: ListarExpedientesQuery) {
  const filas = await prisma.expediente.findMany({
    where: {
      alumno: { usuario: { plantelId: user.plantelId } },
      tipo: { in: alcanceOficina(user) },
      ...(estado && { estado }),
    },
    include: incluir,
    orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
  });
  return filas.map((e) => aRespuesta(e, user));
}

const semestreInsuficiente = () => new AppError(409, 'SEMESTRE_INSUFICIENTE', 'Solo los alumnos de 5.º semestre o superior pueden tener un expediente.');

// RN-01: both the case file and the student record must be at 5th semester or higher.
function exigirSemestre(e: ExpedienteCompleto) {
  if (!semestreValido(e.semestre) || !semestreValido(e.alumno.semestre)) throw semestreInsuficiente();
}

// Audit snapshot of the editable columns (RF-29); dates as calendar days.
const instantanea = (e: ExpedienteCompleto) => ({
  institucionId: e.institucionId,
  supervisorId: e.supervisorId,
  departamento: e.departamento,
  fechaInicio: aFecha(e.fechaInicio),
  fechaTermino: aFecha(e.fechaTermino),
  diasPactados: e.diasPactados,
  horaEntrada: e.horaEntrada,
  horaSalida: e.horaSalida,
  programa: e.programa,
  subprograma: e.subprograma,
});

// The institution must exist in the plantel, be active and accept the program type.
async function validarInstitucion(db: Db, plantelId: string, institucionId: string, tipo: TipoPrograma) {
  const institucion = await db.institucion.findFirst({
    where: { id: institucionId, plantelId, activa: true },
    select: { aceptaServicio: true, aceptaPracticas: true },
  });
  if (!institucion) throw new AppError(400, 'INSTITUCION_INVALIDA', 'La institución no existe o no está activa.');
  const acepta = tipo === 'PRACTICAS' ? institucion.aceptaPracticas : institucion.aceptaServicio;
  if (!acepta) {
    throw new AppError(
      400,
      'INSTITUCION_NO_ACEPTA_TIPO',
      `La institución no recibe alumnos de ${tipo === 'PRACTICAS' ? 'prácticas profesionales' : 'servicio social'}.`,
    );
  }
}

// RF-10: partial edit. The student only while PENDIENTE; the office while the case file is active.
export async function editarExpediente(user: AuthUser, id: string, input: EditarExpedienteInput) {
  const actualizado = await prisma.$transaction(async (tx) => {
    const actual = await cargar(tx, user, id);

    const editable = user.rol === 'ALUMNO' ? actual.estado === 'PENDIENTE' : (ESTADOS_EDITABLES_OFICINA as readonly string[]).includes(actual.estado);
    if (!editable) {
      throw new AppError(
        409,
        'EXPEDIENTE_NO_EDITABLE',
        user.rol === 'ALUMNO'
          ? 'Ya no puedes editar tu expediente. Pide a vinculación que lo corrija.'
          : 'Un expediente finalizado o cancelado ya no se puede editar.',
      );
    }

    const noAplican = (actual.tipo === 'PRACTICAS' ? CAMPOS_SOLO_SERVICIO : CAMPOS_SOLO_PRACTICAS).filter((campo) => input[campo] !== undefined);
    if (noAplican.length > 0) {
      throw new AppError(
        400,
        'CAMPOS_NO_APLICABLES',
        `Estos campos no aplican a ${actual.tipo === 'PRACTICAS' ? 'prácticas profesionales' : 'servicio social'}: ${noAplican.join(', ')}.`,
        { campos: noAplican },
      );
    }

    exigirSemestre(actual);

    // The state the case file would be left in: every cross-field rule is checked against it.
    const institucionId = input.institucionId ?? actual.institucionId;
    const supervisorId = input.supervisorId === undefined ? actual.supervisorId : input.supervisorId;
    const fechaInicio = input.fechaInicio ?? aFecha(actual.fechaInicio);
    const fechaTermino = input.fechaTermino === undefined ? aFecha(actual.fechaTermino) : input.fechaTermino;
    const horaEntrada = input.horaEntrada === undefined ? actual.horaEntrada : input.horaEntrada;
    const horaSalida = input.horaSalida === undefined ? actual.horaSalida : input.horaSalida;

    if (input.institucionId !== undefined) await validarInstitucion(tx, user.plantelId, input.institucionId, actual.tipo);

    const cambiaInstitucion = input.institucionId !== undefined && input.institucionId !== actual.institucionId;
    if (supervisorId && (input.supervisorId !== undefined || cambiaInstitucion)) {
      const supervisor = await tx.supervisor.findFirst({
        where: { id: supervisorId, institucion: { plantelId: user.plantelId } },
        select: { institucionId: true },
      });
      if (!supervisor) throw new AppError(400, 'SUPERVISOR_INVALIDO', 'El supervisor no existe.');
      if (supervisor.institucionId !== institucionId) {
        throw new AppError(
          400,
          'SUPERVISOR_DE_OTRA_INSTITUCION',
          'El supervisor no pertenece a la institución del expediente. Elige otro o quítalo.',
        );
      }
    }

    // Prácticas only: the fields that make no sense for servicio social were already rejected above.
    if (!periodoValido(fechaInicio, fechaTermino)) {
      throw new AppError(400, 'PERIODO_INVALIDO', 'La fecha de término debe ser posterior a la fecha de inicio.');
    }
    if (!horarioValido(horaEntrada, horaSalida)) {
      throw new AppError(400, 'HORARIO_INVALIDO', 'La hora de entrada debe ser anterior a la hora de salida.');
    }

    const { fechaInicio: inicio, fechaTermino: termino, ...resto } = input;
    const nuevo = await tx.expediente.update({
      where: { id },
      data: {
        ...resto,
        ...(inicio !== undefined && { fechaInicio: desdeFecha(inicio) }),
        ...(termino !== undefined && { fechaTermino: termino === null ? null : desdeFecha(termino) }),
      },
      include: incluir,
    });

    const antes = instantanea(actual);
    const despues = instantanea(nuevo);
    const cambios = (Object.keys(despues) as (keyof typeof despues)[]).filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]));
    if (cambios.length > 0) {
      await tx.auditLog.create({
        data: {
          usuarioId: user.id,
          accion: 'EDITAR_EXPEDIENTE',
          entidad: 'Expediente',
          entidadId: id,
          antes: Object.fromEntries(cambios.map((k) => [k, antes[k]])),
          despues: Object.fromEntries(cambios.map((k) => [k, despues[k]])),
        },
      });
    }
    return nuevo;
  });
  return aRespuesta(actualizado, user);
}

const yaHayActivo = () =>
  new AppError(409, 'EXPEDIENTE_ACTIVO_EXISTENTE', 'El alumno ya tiene otro expediente en proceso.');

// RF-10, RF-11: the office confirms institution and supervisor; the case file becomes EN_PROCESO and the
// supervisor confirmed, in one transaction with its audit entry (RF-29).
export async function confirmarExpediente(user: AuthUser, id: string) {
  try {
    const confirmado = await prisma.$transaction(async (tx) => {
      const actual = await cargar(tx, user, id);

      if (actual.estado !== 'PENDIENTE') {
        throw new AppError(409, 'EXPEDIENTE_NO_PENDIENTE', 'Solo se puede confirmar un expediente pendiente.');
      }
      exigirSemestre(actual);

      const pendientes = faltantes(actual);
      if (pendientes.length > 0) {
        throw new AppError(409, 'EXPEDIENTE_INCOMPLETO', 'Faltan datos para confirmar el expediente.', { faltantes: pendientes });
      }

      // RN-03. The partial unique index also guards this (see the P2002 handler below).
      const otro = await tx.expediente.findFirst({
        where: { alumnoId: actual.alumnoId, estado: 'EN_PROCESO', id: { not: id } },
        select: { id: true },
      });
      if (otro) throw yaHayActivo();

      // Guarded by the current state so two simultaneous confirmations cannot both win.
      const { count } = await tx.expediente.updateMany({ where: { id, estado: 'PENDIENTE' }, data: { estado: 'EN_PROCESO' } });
      if (count === 0) throw new AppError(409, 'EXPEDIENTE_NO_PENDIENTE', 'Solo se puede confirmar un expediente pendiente.');

      const supervisorConfirmadoAntes = actual.supervisor?.confirmado ?? false;
      await tx.supervisor.update({ where: { id: actual.supervisorId! }, data: { confirmado: true } });

      await tx.auditLog.create({
        data: {
          usuarioId: user.id,
          accion: 'CONFIRMAR_EXPEDIENTE',
          entidad: 'Expediente',
          entidadId: id,
          antes: { estado: 'PENDIENTE', supervisorConfirmado: supervisorConfirmadoAntes },
          despues: { estado: 'EN_PROCESO', supervisorConfirmado: true, supervisorId: actual.supervisorId },
        },
      });
      return tx.expediente.findUniqueOrThrow({ where: { id }, include: incluir });
    });
    return aRespuesta(confirmado, user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw yaHayActivo();
    throw err;
  }
}

const transicionNoPermitida = (mensaje: string) => new AppError(409, 'TRANSICION_NO_PERMITIDA', mensaje);

const AUDITORIA_ESTADO: Record<AccionEstado, string> = {
  SUSPENDER: 'SUSPENDER_EXPEDIENTE',
  REACTIVAR: 'REACTIVAR_EXPEDIENTE',
  CANCELAR: 'CANCELAR_EXPEDIENTE',
};

const MENSAJE_TRANSICION: Record<AccionEstado, string> = {
  SUSPENDER: 'Solo se puede suspender un expediente en proceso.',
  REACTIVAR: 'Solo se puede reactivar un expediente suspendido.',
  CANCELAR: 'Solo se puede dar de baja un expediente pendiente, en proceso o suspendido.',
};

// RF-11, RF-12: suspend, reactivate or cancel. The UPDATE is guarded by the state read, so two simultaneous
// actions cannot both win; the audit entry (with the reason) is written in the same transaction (RF-29).
export async function cambiarEstado(user: AuthUser, id: string, { accion, motivo }: CambiarEstadoInput) {
  const actualizado = await prisma.$transaction(async (tx) => {
    const actual = await cargar(tx, user, id);
    const destino = transicionDeEstado(accion, actual.estado);
    if (!destino) throw transicionNoPermitida(MENSAJE_TRANSICION[accion]);

    const { count } = await tx.expediente.updateMany({ where: { id, estado: actual.estado }, data: { estado: destino } });
    if (count === 0) throw transicionNoPermitida(MENSAJE_TRANSICION[accion]);

    await tx.auditLog.create({
      data: {
        usuarioId: user.id,
        accion: AUDITORIA_ESTADO[accion],
        entidad: 'Expediente',
        entidadId: id,
        antes: { estado: actual.estado },
        despues: { estado: destino, motivo },
      },
    });
    return tx.expediente.findUniqueOrThrow({ where: { id }, include: incluir });
  });
  return aRespuesta(actualizado, user);
}

// Minutes already earned in a case file: weeks validated by the supervisor or the office plus what it received
// from an earlier transfer (specs 8.4). Totals are never stored, they are computed.
async function minutosValidados(db: Db, expedienteId: string, minutosTransferidos: number) {
  const { _sum } = await db.asistencia.aggregate({
    where: { expedienteId, semana: { estado: 'VALIDADA' } },
    _sum: { minutosAcreditables: true },
  });
  return (_sum.minutosAcreditables ?? 0) + minutosTransferidos;
}

// RF-18, RN-11, RN-16: progress of a case file, computed from the attendances (specs 8.4). Only validated minutes
// count towards finishing; registered ones (not validated yet) only feed the end-date estimate. `ahora` is
// injectable for tests.
export async function obtenerAvance(user: AuthUser, id: string, ahora: () => Date = () => new Date()) {
  const expediente = await cargar(prisma, user, id);
  const metaMinutos = expediente.metaHoras * 60;

  const validados = await minutosValidados(prisma, id, expediente.minutosTransferidos);
  const [registrados, cerradas, abierta] = await Promise.all([
    prisma.asistencia.aggregate({
      where: { expedienteId: id, OR: [{ semanaId: null }, { semana: { estado: { not: 'VALIDADA' } } }] },
      _sum: { minutosAcreditables: true },
    }),
    prisma.asistencia.findMany({
      where: { expedienteId: id, estado: 'CERRADA', minutosAcreditables: { gt: 0 } },
      select: { entrada: true, minutosAcreditables: true },
    }),
    prisma.asistencia.findFirst({ where: { expedienteId: id, estado: 'ABIERTA' }, select: { id: true, entrada: true } }),
  ]);
  const minutosRegistrados = registrados._sum.minutosAcreditables ?? 0;

  // Credited minutes per local day of the entry (RN-15) over the whole history.
  const minutosPorDia: Record<string, number> = {};
  for (const { entrada, minutosAcreditables } of cerradas) {
    const dia = fechaLocal(entrada);
    minutosPorDia[dia] = (minutosPorDia[dia] ?? 0) + (minutosAcreditables ?? 0);
  }

  return {
    expedienteId: id,
    metaMinutos,
    minutosValidados: validados,
    minutosRegistrados,
    minutosFaltantes: Math.max(0, metaMinutos - validados),
    porcentaje: Math.min(100, Math.floor((validados * 100) / metaMinutos)),
    // RN-16: the estimate follows the student's real pace, so registered minutes count as done.
    fechaEstimada: estimarFechaTermino({
      minutosFaltantes: Math.max(0, metaMinutos - validados - minutosRegistrados),
      minutosPorDia,
      hoy: ahora(),
    }),
    turnoAbierto: abierta,
  };
}

// RN-12: the current case file is cancelled and a PENDIENTE one is created in the new institution, in one
// transaction. The old one is cancelled first because the partial unique index allows one active case file.
export async function transferirExpediente(user: AuthUser, id: string, { institucionId, conservarHoras, motivo }: TransferirExpedienteInput) {
  try {
    const { anterior, nuevo } = await prisma.$transaction(async (tx) => {
      const actual = await cargar(tx, user, id);
      const noPermitida = () => transicionNoPermitida('Solo se puede transferir un expediente en proceso o suspendido.');
      if (!puedeTransferir(actual.estado)) throw noPermitida();

      await validarInstitucion(tx, user.plantelId, institucionId, actual.tipo);
      if (actual.institucionId === institucionId) {
        throw new AppError(400, 'INSTITUCION_IGUAL', 'El expediente ya está en esa institución.');
      }

      const minutosTransferidos = conservarHoras ? await minutosValidados(tx, id, actual.minutosTransferidos) : 0;

      const { count } = await tx.expediente.updateMany({ where: { id, estado: actual.estado }, data: { estado: 'CANCELADO' } });
      if (count === 0) throw noPermitida();

      const creado = await tx.expediente.create({
        data: {
          alumnoId: actual.alumnoId,
          tipo: actual.tipo,
          semestre: actual.semestre,
          metaHoras: actual.metaHoras,
          estado: 'PENDIENTE',
          institucionId,
          minutosTransferidos,
          motivoTransferencia: motivo,
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          usuarioId: user.id,
          accion: 'TRANSFERIR_EXPEDIENTE',
          entidad: 'Expediente',
          entidadId: id,
          antes: { estado: actual.estado, institucionId: actual.institucionId },
          despues: { estado: 'CANCELADO', expedienteNuevoId: creado.id, institucionId, conservarHoras, minutosTransferidos, motivo },
        },
      });
      return {
        anterior: await tx.expediente.findUniqueOrThrow({ where: { id }, include: incluir }),
        nuevo: await tx.expediente.findUniqueOrThrow({ where: { id: creado.id }, include: incluir }),
      };
    });
    return { anterior: aRespuesta(anterior, user), nuevo: aRespuesta(nuevo, user) };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw yaHayActivo();
    throw err;
  }
}

type Omitido = { alumnoId: string; motivo: string };
type Asignado = { alumnoId: string; expedienteId: string; tipo: TipoPrograma };

// RF-01, RN-03a, RN-03b: creates the PENDIENTE case file of the other program for each student who finished the
// first one. Each student has its own transaction so one conflict does not undo the rest; the ones that cannot
// be assigned come back with the reason.
export async function asignarPrograma(user: AuthUser, alumnoIds: string[]) {
  const alcance = alcanceOficina(user);
  const existentes = await prisma.alumno.findMany({
    where: { id: { in: alumnoIds }, usuario: { plantelId: user.plantelId } },
    select: { id: true },
  });
  const delPlantel = new Set(existentes.map((a) => a.id));

  const asignados: Asignado[] = [];
  const omitidos: Omitido[] = [];
  for (const alumnoId of alumnoIds) {
    if (!delPlantel.has(alumnoId)) {
      omitidos.push({ alumnoId, motivo: 'El alumno no existe.' });
      continue;
    }
    try {
      const resultado = await prisma.$transaction(async (tx) => {
        const alumno = await tx.alumno.findUniqueOrThrow({
          where: { id: alumnoId },
          select: { semestre: true, expedientes: { select: { tipo: true, estado: true, creadoEn: true } } },
        });
        const decision = decidirAsignacion({ semestreAlumno: alumno.semestre, expedientes: alumno.expedientes, alcance });
        if ('motivo' in decision) return decision;

        const creado = await tx.expediente.create({
          data: { alumnoId, tipo: decision.tipo, semestre: alumno.semestre, metaHoras: META_HORAS[decision.tipo], estado: 'PENDIENTE' },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: {
            usuarioId: user.id,
            accion: 'ASIGNAR_PROGRAMA',
            entidad: 'Expediente',
            entidadId: creado.id,
            despues: { alumnoId, tipo: decision.tipo, estado: 'PENDIENTE', semestre: alumno.semestre },
          },
        });
        return { tipo: decision.tipo, expedienteId: creado.id };
      });
      if ('motivo' in resultado) omitidos.push({ alumnoId, motivo: resultado.motivo });
      else asignados.push({ alumnoId, ...resultado });
    } catch (err) {
      // RN-03: another request created an active case file for this student first.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        omitidos.push({ alumnoId, motivo: 'El alumno ya tiene un expediente activo.' });
        continue;
      }
      throw err;
    }
  }
  return { asignados, omitidos };
}
