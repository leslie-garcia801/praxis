import { prisma } from '../../lib/prisma.js';

// RN-03: at most one case file per student is in one of these states.
const ESTADOS_ACTIVOS = ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'] as const;

// Students without an email get a placeholder on the reserved `.invalid` domain (task 0003, option A).
const esCorreoDeRelleno = (email: string) => email.endsWith('.invalid');

// `@db.Date` columns come back as UTC midnight; send them as plain calendar dates.
const fechaCalendario = (fecha: Date | null) => (fecha ? fecha.toISOString().slice(0, 10) : null);

export async function obtenerPerfil(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      alumno: {
        include: {
          carrera: { select: { nombre: true } },
          expedientes: {
            where: { estado: { in: [...ESTADOS_ACTIVOS] } },
            include: { institucion: { select: { id: true, nombre: true } } },
            orderBy: { creadoEn: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  const { alumno } = user;
  const expediente = alumno?.expedientes[0];

  return {
    usuario: {
      id: user.id,
      nombre: user.name,
      email: esCorreoDeRelleno(user.email) ? null : user.email,
      matricula: user.username,
      rol: user.rol,
      oficina: user.oficina,
      debeCambiar: user.debeCambiar,
    },
    alumno: alumno
      ? {
          nombre: alumno.nombre,
          apellidoPaterno: alumno.apellidoPaterno,
          apellidoMaterno: alumno.apellidoMaterno,
          carrera: alumno.carrera.nombre,
          semestre: alumno.semestre,
          grupo: alumno.grupo,
          turno: alumno.turno,
        }
      : null,
    expedienteActivo: expediente
      ? {
          id: expediente.id,
          tipo: expediente.tipo,
          estado: expediente.estado,
          metaHoras: expediente.metaHoras,
          fechaInicio: fechaCalendario(expediente.fechaInicio),
          fechaTermino: fechaCalendario(expediente.fechaTermino),
          institucion: expediente.institucion,
        }
      : null,
  };
}
