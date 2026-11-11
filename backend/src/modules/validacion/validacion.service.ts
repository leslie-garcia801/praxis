import { env } from '../../config/env.js';
import { turnoFueraDeHorario } from '../../domain/horario.js';
import { generarToken, hashToken } from '../../domain/tokens.js';
import { AppError } from '../../lib/errors.js';
import { enviarCorreo } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import { sumarDias } from '../../lib/tiempo.js';
import { correoDeValidacion, DIAS_VIGENCIA } from './validacion.correo.js';
import type { DecisionesInput } from './validacion.schemas.js';

const DIA_MS = 86_400_000;
const aFecha = (d: Date) => d.toISOString().slice(0, 10);
const nombreCompleto = (p: { nombre: string; apellidoPaterno: string; apellidoMaterno: string | null }) =>
  [p.nombre, p.apellidoPaterno, p.apellidoMaterno].filter(Boolean).join(' ');

// The email is sent inside the transaction, before it commits: if sending fails the link is rolled back and never
// exists. The opposite failure (the commit fails after the email left) is far less likely and leaves a link that
// answers "not valid"; the next weekly email replaces it. The send is a network call, so the timeout is generous.
const TIMEOUT_TRANSACCION_MS = 20_000;

// RF-21, RF-21a: creates a link for the weeks in `semanaIds` (all must belong to students of `supervisorId`) and
// emails it to the supervisor's current address. Returns the link id. A sending failure is thrown and nothing is
// stored. `ahora` is injectable for tests.
export async function enviarEnlaceValidacion(supervisorId: string, semanaIds: string[], ahora: () => Date = () => new Date()) {
  const ids = [...new Set(semanaIds)];
  if (ids.length === 0) throw new Error('Un enlace de validación necesita al menos una semana.');

  const supervisor = await prisma.supervisor.findUnique({ where: { id: supervisorId } });
  if (!supervisor) throw new Error(`El supervisor ${supervisorId} no existe.`);
  const semanas = await prisma.semanaBitacora.findMany({
    where: { id: { in: ids } },
    include: { expediente: { include: { alumno: true } } },
  });
  if (semanas.length !== ids.length || semanas.some((s) => s.expediente.supervisorId !== supervisorId)) {
    throw new Error('Todas las semanas deben existir y pertenecer a alumnos del supervisor.');
  }
  semanas.sort((a, b) => nombreCompleto(a.expediente.alumno).localeCompare(nombreCompleto(b.expediente.alumno), 'es') || a.semanaInicio.getTime() - b.semanaInicio.getTime());

  const momento = ahora();
  const token = generarToken();
  return prisma.$transaction(
    async (tx) => {
      const enlace = await tx.enlaceValidacion.create({
        data: {
          supervisorId,
          tokenHash: hashToken(token),
          expiraEn: new Date(momento.getTime() + DIAS_VIGENCIA * DIA_MS),
          creadoEn: momento,
          semanas: { create: semanas.map((s) => ({ semanaId: s.id })) },
        },
      });
      await enviarCorreo({
        para: supervisor.correo,
        ...correoDeValidacion({
          supervisor: nombreCompleto(supervisor),
          semanas: semanas.map((s) => ({ alumno: nombreCompleto(s.expediente.alumno), semanaInicio: aFecha(s.semanaInicio) })),
          enlace: `${env.FRONTEND_ORIGIN.replace(/\/$/, '')}/validar/${token}`,
        }),
      });
      return enlace.id;
    },
    { timeout: TIMEOUT_TRANSACCION_MS },
  );
}

// RF-21: unknown token is 404, an expired one is 410 (the supervisor should use the latest email).
export async function exigirEnlaceVigente(token: string, ahora: () => Date = () => new Date()) {
  const enlace = await prisma.enlaceValidacion.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { supervisor: true, semanas: { select: { semanaId: true } } },
  });
  if (!enlace) throw new AppError(404, 'ENLACE_NO_VALIDO', 'Este enlace no es válido.');
  if (enlace.expiraEn <= ahora()) throw new AppError(410, 'ENLACE_VENCIDO', 'Este enlace venció. Usa el del correo más reciente.');
  return enlace;
}

type EnlaceVigente = Awaited<ReturnType<typeof exigirEnlaceVigente>>;

// RF-21, RN-06b: the weeks of the link with their shifts and logbook. Only what the supervisor needs: no control
// number or other student data (RNF-07). `fueraDeHorario` is computed on read, never stored.
export async function obtenerEnlace(enlace: EnlaceVigente) {
  const semanas = await prisma.semanaBitacora.findMany({
    where: { id: { in: enlace.semanas.map((s) => s.semanaId) } },
    include: {
      asistencias: { orderBy: { entrada: 'asc' } },
      expediente: { include: { institucion: true, alumno: { include: { carrera: true } } } },
    },
  });
  semanas.sort(
    (a, b) =>
      nombreCompleto(a.expediente.alumno).localeCompare(nombreCompleto(b.expediente.alumno), 'es') ||
      a.semanaInicio.getTime() - b.semanaInicio.getTime(),
  );

  return {
    supervisor: { nombre: nombreCompleto(enlace.supervisor) },
    expiraEn: enlace.expiraEn,
    semanas: semanas.map((s) => {
      const { expediente } = s;
      // RN-06b only applies to practices with an agreed schedule.
      const conHorario = expediente.tipo === 'PRACTICAS';
      const inicio = aFecha(s.semanaInicio);
      return {
        id: s.id,
        alumno: { nombre: nombreCompleto(expediente.alumno), carrera: expediente.alumno.carrera.nombre },
        institucion: expediente.institucion?.nombre ?? null,
        semanaInicio: inicio,
        semanaFin: sumarDias(inicio, 6),
        estado: s.estado,
        actividades: s.actividades,
        turnos: s.asistencias.map((a) => ({
          entrada: a.entrada,
          salida: a.salida,
          estado: a.estado,
          minutosAcreditables: a.minutosAcreditables,
          fueraDeHorario:
            conHorario &&
            turnoFueraDeHorario({
              entrada: a.entrada,
              salida: a.salida,
              diasPactados: expediente.diasPactados,
              horaEntrada: expediente.horaEntrada,
              horaSalida: expediente.horaSalida,
            }),
        })),
        minutosAcreditables: s.asistencias.reduce((suma, a) => suma + (a.minutosAcreditables ?? 0), 0),
      };
    }),
  };
}

export type Resultado = 'VALIDADA' | 'RECHAZADA' | 'YA_RESUELTA';

// RF-21, RF-21a, RF-22, RF-29: resolves the given weeks of the link. Every week must belong to the link (otherwise
// nothing is resolved). Each week is resolved only while it is still ENVIADA, so a week someone else resolved first
// answers YA_RESUELTA and is left untouched. The audit entry is written in the same transaction. `ahora` is
// injectable for tests.
export async function resolverSemanas(enlace: EnlaceVigente, { decisiones }: DecisionesInput, ahora: () => Date = () => new Date()) {
  const delEnlace = new Set(enlace.semanas.map((s) => s.semanaId));
  const ajenas = decisiones.filter((d) => !delEnlace.has(d.semanaId));
  if (ajenas.length > 0) {
    throw new AppError(400, 'SEMANA_FUERA_DEL_ENLACE', 'Una de las semanas no pertenece a este enlace.', ajenas.map((d) => ({ semanaId: d.semanaId })));
  }

  const momento = ahora();
  const resultados = await prisma.$transaction(async (tx) => {
    const salida: { semanaId: string; resultado: Resultado }[] = [];
    for (const d of decisiones) {
      const validar = d.accion === 'VALIDAR';
      const estado = validar ? 'VALIDADA' : 'RECHAZADA';
      const { count } = await tx.semanaBitacora.updateMany({
        where: { id: d.semanaId, estado: 'ENVIADA' },
        data: validar
          ? { estado, validadoPor: 'SUPERVISOR', validadoEn: momento, comentario: null }
          : { estado, comentario: d.comentario },
      });
      if (count === 0) {
        salida.push({ semanaId: d.semanaId, resultado: 'YA_RESUELTA' });
        continue;
      }
      await tx.auditLog.create({
        data: {
          usuarioId: null,
          accion: validar ? 'VALIDAR_SEMANA' : 'RECHAZAR_SEMANA',
          entidad: 'SemanaBitacora',
          entidadId: d.semanaId,
          antes: { estado: 'ENVIADA' },
          despues: {
            estado,
            supervisorId: enlace.supervisorId,
            enlaceId: enlace.id,
            ...(validar ? {} : { comentario: d.comentario }),
          },
        },
      });
      salida.push({ semanaId: d.semanaId, resultado: estado });
    }
    return salida;
  });
  return { resultados };
}
