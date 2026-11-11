import { calcularMinutosAcreditables } from '../../domain/horas.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { fechaLocal, inicioSemana, instanteLocal, sumarDias } from '../../lib/tiempo.js';
import type { AuthUser } from '../../middleware/auth.js';
import { cargar } from '../expedientes/expedientes.service.js';
import { ESTADOS_EDITABLES, ESTADOS_QUE_ENVIAN, semanaCerrada } from '../semanas/semanas.service.js';
import type { HistorialQuery } from './asistencias.schemas.js';

// RN-03: states of a case file that is still "alive" for the student.
const ESTADOS_ACTIVOS = ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'] as const;

// The student's own case file: the active one, or else the most recent of any state.
async function expedienteDelAlumno(user: AuthUser) {
  const alumno = await prisma.alumno.findUnique({ where: { usuarioId: user.id }, select: { id: true } });
  const orden = [{ creadoEn: 'desc' as const }, { id: 'asc' as const }];
  const expediente =
    alumno &&
    ((await prisma.expediente.findFirst({
      where: { alumnoId: alumno.id, estado: { in: [...ESTADOS_ACTIVOS] } },
      orderBy: orden,
      select: { id: true },
    })) ??
      (await prisma.expediente.findFirst({ where: { alumnoId: alumno.id }, orderBy: orden, select: { id: true } })));
  if (!expediente) throw new AppError(404, 'EXPEDIENTE_NO_ENCONTRADO', 'No tienes ningún expediente.');
  return expediente.id;
}

// RF-19, RN-04, RN-09, RN-15: one local week (Monday to Sunday) of attendances, grouped by the local day of the
// entry. `ahora` is injectable for tests.
export async function obtenerHistorial(user: AuthUser, { semana, expedienteId }: HistorialQuery, ahora: () => Date = () => new Date()) {
  let id = expedienteId;
  if (user.rol === 'ALUMNO') {
    id ??= await expedienteDelAlumno(user);
  } else if (!id) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', [
      { path: 'expedienteId', message: 'Indica el expediente.' },
    ]);
  }
  const expediente = await cargar(prisma, user, id); // 404 outside the plantel, 403 for another student or another office (RN-03b)

  const inicio = inicioSemana(semana ?? fechaLocal(ahora()));
  const fechas = Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i));

  // One extra day on each side so shifts crossing midnight are split with all their neighbours (as in the scan).
  const turnos = await prisma.asistencia.findMany({
    where: {
      expedienteId: id,
      entrada: { gte: instanteLocal(sumarDias(inicio, -1), '00:00'), lt: instanteLocal(sumarDias(inicio, 8), '00:00') },
    },
    orderBy: { entrada: 'asc' },
  });
  const { porDia } = calcularMinutosAcreditables(turnos);
  const bitacora = await prisma.semanaBitacora.findFirst({
    where: { expedienteId: id, semanaInicio: new Date(`${inicio}T00:00:00.000Z`) },
  });
  // RF-20: only the student writes the logbook, so the office never gets edit or send permission.
  const puedeEditar =
    user.rol === 'ALUMNO' && bitacora !== null && (ESTADOS_EDITABLES as readonly string[]).includes(bitacora.estado);
  const puedeEnviar =
    puedeEditar &&
    semanaCerrada(bitacora!.semanaInicio, ahora()) &&
    (ESTADOS_QUE_ENVIAN as readonly string[]).includes(expediente.estado);

  const dias = fechas.map((fecha) => {
    const resumen = porDia[fecha] ?? { minutos: 0, acreditables: 0 };
    return {
      fecha,
      turnos: turnos
        .filter((t) => fechaLocal(t.entrada) === fecha)
        .map((t) => ({
          id: t.id,
          entrada: t.entrada,
          salida: t.salida,
          estado: t.estado,
          minutosAcreditables: t.minutosAcreditables,
          sinConexion: t.sinConexion,
        })),
      minutosDia: resumen.minutos,
      minutosAcreditablesDia: resumen.acreditables,
    };
  });

  return {
    inicio,
    fin: fechas[6]!,
    estadoValidacion: bitacora?.estado ?? null,
    id: bitacora?.id ?? null,
    actividades: bitacora?.actividades ?? null,
    // The supervisor's comment only matters while the week is waiting to be corrected.
    comentario: bitacora?.estado === 'RECHAZADA' ? bitacora.comentario : null,
    enviadaEn: bitacora?.enviadaEn ?? null,
    puedeEditar,
    puedeEnviar,
    dias,
    totales: {
      minutos: dias.reduce((suma, d) => suma + d.minutosDia, 0),
      minutosAcreditables: dias.reduce((suma, d) => suma + d.minutosAcreditablesDia, 0),
    },
  };
}
