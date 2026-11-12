import { randomUUID } from 'node:crypto';
import { alcanceOficina, type TipoPrograma } from '../../domain/oficinas.js';
import { META_HORAS } from '../../domain/programas.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { construirXlsx } from '../../lib/xlsx.js';
import { leerTabla } from './archivo.js';
import {
  ENCABEZADOS_ALUMNOS,
  extraerFilas,
  indexarCarreras,
  validarFilas,
  type DatosAlumno,
  type ErrorFila,
} from './alumnos.parser.js';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Db = typeof prisma | Tx;

const ESTADOS_ACTIVOS = ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'] as const;
const NOMBRE_TIPO: Record<TipoPrograma, string> = { SERVICIO_SOCIAL: 'servicio social', PRACTICAS: 'prácticas' };

export type Accion = 'CREAR' | 'ACTUALIZAR';

export type FilaReporte = {
  fila: number;
  matricula: string;
  accion: Accion | null;
  errores: ErrorFila[];
};

export type ReporteImportacion = {
  resumen: { total: number; validas: number; conErrores: number; crear: number; actualizar: number };
  filas: FilaReporte[];
};

// What confirming a valid row will do. Kept server-side only for the duration of one request.
type PlanFila = {
  datos: DatosAlumno;
  accion: Accion;
  existente: { usuarioId: string; alumnoId: string } | null;
  crearExpediente: boolean;
};

type Analisis = { reporte: ReporteImportacion; planes: PlanFila[] };

export function plantillaAlumnos(): Buffer {
  return construirXlsx([ENCABEZADOS_ALUMNOS], 'Alumnos');
}

// Parses, validates and checks every row against the database. Writes nothing.
async function analizar(db: Db, usuario: AuthUser, archivo: Buffer): Promise<Analisis> {
  const filas = extraerFilas(leerTabla(archivo));
  const carreras = indexarCarreras(await db.carrera.findMany({ select: { id: true, nombre: true } }));
  const validadas = validarFilas(filas, carreras);

  const matriculas = validadas.flatMap((f) => (f.datos ? [f.datos.matricula] : []));
  const existentes = await db.user.findMany({
    where: { username: { in: matriculas } },
    select: {
      id: true,
      username: true,
      rol: true,
      plantelId: true,
      alumno: {
        select: { id: true, expedientes: { where: { estado: { in: [...ESTADOS_ACTIVOS] } }, select: { tipo: true } } },
      },
    },
  });
  const porMatricula = new Map(existentes.map((u) => [u.username, u]));
  const alcance = alcanceOficina(usuario);

  const planes: PlanFila[] = [];
  const reporteFilas: FilaReporte[] = validadas.map((f) => {
    const errores = [...f.errores];
    const datos = f.datos;
    let plan: PlanFila | null = null;

    if (datos) {
      // RN-03b: a vinculación user with an office only imports rows of that type.
      if (!alcance.includes(datos.tipo)) {
        errores.push({
          campo: 'tipo',
          mensaje: `Tu oficina no administra alumnos de ${NOMBRE_TIPO[datos.tipo]} (RN-03b).`,
        });
      }

      const existente = porMatricula.get(datos.matricula);
      if (!existente) {
        plan = { datos, accion: 'CREAR', existente: null, crearExpediente: true };
      } else if (existente.rol !== 'ALUMNO' || existente.plantelId !== usuario.plantelId || !existente.alumno) {
        errores.push({ campo: 'matricula', mensaje: 'Este número de control ya pertenece a otra cuenta.' });
      } else {
        const activo = existente.alumno.expedientes[0];
        const ref = { usuarioId: existente.id, alumnoId: existente.alumno.id };
        if (!activo) {
          plan = { datos, accion: 'ACTUALIZAR', existente: ref, crearExpediente: true };
        } else if (activo.tipo === datos.tipo) {
          plan = { datos, accion: 'ACTUALIZAR', existente: ref, crearExpediente: false };
        } else {
          // RN-03: one active program at a time.
          errores.push({
            campo: 'tipo',
            mensaje: `El alumno ya tiene un programa de ${NOMBRE_TIPO[activo.tipo]} activo; no puede tener otro a la vez (RN-03).`,
          });
        }
      }
    }

    const valida = errores.length === 0 && plan !== null;
    if (valida) planes.push(plan!);
    return { fila: f.fila, matricula: f.matricula, accion: valida ? plan!.accion : null, errores };
  });

  const crear = planes.filter((p) => p.accion === 'CREAR').length;
  return {
    planes,
    reporte: {
      resumen: {
        total: reporteFilas.length,
        validas: planes.length,
        conErrores: reporteFilas.length - planes.length,
        crear,
        actualizar: planes.length - crear,
      },
      filas: reporteFilas,
    },
  };
}

export async function previsualizarAlumnos(usuario: AuthUser, archivo: Buffer): Promise<ReporteImportacion> {
  return (await analizar(prisma, usuario, archivo)).reporte;
}

export type ResultadoConfirmacion = { resumen: { creados: number; actualizados: number; expedientesCreados: number } };

// All-or-nothing: the file is re-validated from scratch inside the transaction and nothing is
// written when any row has errors.
export async function confirmarAlumnos(usuario: AuthUser, archivo: Buffer): Promise<ResultadoConfirmacion> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const { reporte, planes } = await analizar(tx, usuario, archivo);
        if (reporte.resumen.conErrores > 0) {
          throw new AppError(
            422,
            'IMPORTACION_CON_ERRORES',
            'El archivo tiene errores. Corrígelos y vuelve a subirlo; no se importó ningún alumno.',
            reporte,
          );
        }
        return await aplicar(tx, usuario, planes);
      },
      // Up to 2000 rows: the default 5 s interactive timeout is too tight.
      { timeout: 60_000 },
    );
  } catch (err) {
    // Unique violation: another import created the same control number between our check and our write.
    if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002') {
      throw new AppError(409, 'IMPORTACION_CONFLICTO', 'Otro proceso modificó estos alumnos. Vuelve a intentarlo.');
    }
    throw err;
  }
}

async function aplicar(tx: Tx, usuario: AuthUser, planes: PlanFila[]): Promise<ResultadoConfirmacion> {
  const nuevos = planes.filter((p) => p.accion === 'CREAR');
  const actualizados = planes.filter((p) => p.accion === 'ACTUALIZAR');

  // New students: Better Auth user WITHOUT a credential account; they activate it themselves (RF-02).
  const ids = nuevos.map((p) => ({ p, usuarioId: randomUUID(), alumnoId: randomUUID() }));
  await tx.user.createMany({
    data: ids.map(({ p, usuarioId }) => ({
      id: usuarioId,
      name: nombreCompleto(p.datos),
      email: `${p.datos.matricula}@alumno.praxis.invalid`,
      username: p.datos.matricula,
      displayUsername: p.datos.matricula,
      plantelId: usuario.plantelId,
      rol: 'ALUMNO' as const,
    })),
  });
  await tx.alumno.createMany({
    data: ids.map(({ p, usuarioId, alumnoId }) => ({ id: alumnoId, usuarioId, ...datosAlumno(p.datos) })),
  });

  // Existing students: only personal data changes; never credentials, email, sessions or flags.
  for (const p of actualizados) {
    await tx.alumno.update({ where: { id: p.existente!.alumnoId }, data: datosAlumno(p.datos) });
    await tx.user.update({ where: { id: p.existente!.usuarioId }, data: { name: nombreCompleto(p.datos) } });
  }

  // RN-02: goal hours by program type.
  const expedientes = [
    ...ids.map(({ p, alumnoId }) => ({ p, alumnoId })),
    ...actualizados.filter((p) => p.crearExpediente).map((p) => ({ p, alumnoId: p.existente!.alumnoId })),
  ];
  await tx.expediente.createMany({
    data: expedientes.map(({ p, alumnoId }) => ({
      id: randomUUID(),
      alumnoId,
      tipo: p.datos.tipo,
      semestre: p.datos.semestre,
      metaHoras: META_HORAS[p.datos.tipo],
      estado: 'PENDIENTE' as const,
    })),
  });

  // RF-29 / RNF-07: only control numbers and counters, no names or other personal data.
  await tx.auditLog.create({
    data: {
      usuarioId: usuario.id,
      accion: 'IMPORTAR_ALUMNOS',
      entidad: 'Importacion',
      entidadId: randomUUID(),
      despues: {
        creados: nuevos.map((p) => p.datos.matricula),
        actualizados: actualizados.map((p) => p.datos.matricula),
        expedientesCreados: expedientes.length,
      },
    },
  });

  return {
    resumen: { creados: nuevos.length, actualizados: actualizados.length, expedientesCreados: expedientes.length },
  };
}

function nombreCompleto(d: DatosAlumno): string {
  return [d.nombre, d.apellidoPaterno, d.apellidoMaterno].filter(Boolean).join(' ');
}

function datosAlumno(d: DatosAlumno) {
  return {
    nombre: d.nombre,
    apellidoPaterno: d.apellidoPaterno,
    apellidoMaterno: d.apellidoMaterno,
    carreraId: d.carreraId,
    semestre: d.semestre,
    grupo: d.grupo,
    turno: d.turno,
  };
}
