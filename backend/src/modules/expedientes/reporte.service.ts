// RF-27: hours and activities report (PDF) of one case file. Access follows `cargar`: a student only reaches their
// own case file and vinculación only those of its office (RN-03b).
import { construirReporte, type DatosReporte } from '../../domain/reportePdf.js';
import { AppError } from '../../lib/errors.js';
import { renderizarPdf } from '../../lib/pdf.js';
import { prisma } from '../../lib/prisma.js';
import { fechaLocal } from '../../lib/tiempo.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { ReporteQuery } from './expedientes.schemas.js';
import { cargar } from './expedientes.service.js';

const aFecha = (d: Date) => d.toISOString().slice(0, 10);

// Loads everything the report needs. Totals are computed by query (specs 8.4), never stored.
export async function datosReporte(user: AuthUser, id: string, { desde, hasta }: ReporteQuery): Promise<DatosReporte> {
  if (desde && hasta && desde > hasta) {
    throw new AppError(400, 'RANGO_INVALIDO', 'La fecha inicial no puede ser posterior a la fecha final.');
  }
  const expediente = await cargar(prisma, user, id);
  const [plantel, semanas, turnos, validados] = await Promise.all([
    prisma.plantel.findUniqueOrThrow({ where: { id: user.plantelId }, select: { nombre: true } }),
    prisma.semanaBitacora.findMany({ where: { expedienteId: id, estado: 'VALIDADA' } }),
    prisma.asistencia.findMany({
      where: { expedienteId: id, estado: 'CERRADA', semana: { estado: 'VALIDADA' } },
      select: { entrada: true, salida: true, minutosAcreditables: true, semanaId: true },
    }),
    prisma.asistencia.aggregate({
      where: { expedienteId: id, semana: { estado: 'VALIDADA' } },
      _sum: { minutosAcreditables: true },
    }),
  ]);
  const { alumno, supervisor } = expediente;

  return {
    plantel: plantel.nombre,
    tipo: expediente.tipo,
    desde: desde ?? null,
    hasta: hasta ?? null,
    alumno: {
      nombreCompleto: [alumno.nombre, alumno.apellidoPaterno, alumno.apellidoMaterno].filter(Boolean).join(' '),
      matricula: alumno.usuario.username ?? '',
      carrera: alumno.carrera.nombre,
      semestre: alumno.semestre,
      grupo: alumno.grupo,
    },
    institucion: expediente.institucion?.nombre ?? null,
    departamento: expediente.departamento,
    supervisor: supervisor
      ? {
          titulo: supervisor.titulo,
          nombreCompleto: [supervisor.nombre, supervisor.apellidoPaterno, supervisor.apellidoMaterno].filter(Boolean).join(' '),
          puesto: supervisor.puesto,
        }
      : null,
    turnos: turnos.map((t) => ({ ...t, minutosAcreditables: t.minutosAcreditables ?? 0 })),
    semanas: semanas.map((s) => ({ id: s.id, semanaInicio: aFecha(s.semanaInicio), estado: s.estado, actividades: s.actividades })),
    minutosValidadosAcumulados: (validados._sum.minutosAcreditables ?? 0) + expediente.minutosTransferidos,
    metaMinutos: expediente.metaHoras * 60,
  };
}

export async function generarReporte(user: AuthUser, id: string, query: ReporteQuery) {
  const datos = await datosReporte(user, id, query);
  return {
    pdf: await renderizarPdf(construirReporte(datos)),
    archivo: `reporte-${datos.alumno.matricula}-${fechaLocal(new Date())}.pdf`,
  };
}
