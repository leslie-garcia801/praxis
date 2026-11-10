import { randomUUID } from 'node:crypto';
import { normalizarNombre } from '../../domain/nombres.js';
import { generarCredencialesQr } from '../../domain/qrInstitucion.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { construirXlsx, leerTabla } from './archivo.js';
import type { ErrorFila } from './alumnos.parser.js';
import {
  ENCABEZADOS_INSTITUCIONES,
  extraerFilas,
  indexarCarreras,
  validarFilas,
  type DatosInstitucion,
} from './instituciones.parser.js';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Db = typeof prisma | Tx;

const MAX_INTENTOS_QR = 5;

export type Accion = 'CREAR' | 'OMITIR';

export type Coincidencia = { id: string; nombre: string; por: 'RFC' | 'NOMBRE' };

export type FilaReporte = {
  fila: number;
  nombre: string;
  accion: Accion | null;
  /** Existing institution a skipped row matched; null otherwise. */
  coincideCon: Coincidencia | null;
  errores: ErrorFila[];
};

export type ReporteImportacion = {
  resumen: { total: number; validas: number; conErrores: number; crear: number; omitir: number };
  filas: FilaReporte[];
};

type Analisis = { reporte: ReporteImportacion; nuevas: DatosInstitucion[] };

export function plantillaInstituciones(): Buffer {
  return construirXlsx([ENCABEZADOS_INSTITUCIONES], 'Instituciones');
}

// Parses, validates and checks every row against the plantel catalog. Writes nothing.
async function analizar(db: Db, usuario: AuthUser, archivo: Buffer): Promise<Analisis> {
  const filas = extraerFilas(leerTabla(archivo));
  const carreras = indexarCarreras(await db.carrera.findMany({ select: { id: true, nombre: true } }));
  const validadas = validarFilas(filas, carreras);

  const catalogo = await db.institucion.findMany({
    where: { plantelId: usuario.plantelId },
    select: { id: true, nombre: true, rfc: true },
  });
  const porRfc = new Map(catalogo.flatMap((i) => (i.rfc ? [[i.rfc.toUpperCase(), i] as const] : [])));
  const porNombre = new Map(catalogo.map((i) => [normalizarNombre(i.nombre), i] as const));

  const nuevas: DatosInstitucion[] = [];
  let omitir = 0;
  const reporteFilas = validadas.map((f): FilaReporte => {
    const datos = f.datos;
    if (!datos) return { fila: f.fila, nombre: f.nombre, accion: null, coincideCon: null, errores: f.errores };

    const porRfcCoincide = datos.rfc ? porRfc.get(datos.rfc) : undefined;
    const coincidencia = porRfcCoincide
      ? ({ id: porRfcCoincide.id, nombre: porRfcCoincide.nombre, por: 'RFC' } as const)
      : (() => {
          const i = porNombre.get(normalizarNombre(datos.nombre));
          return i ? ({ id: i.id, nombre: i.nombre, por: 'NOMBRE' } as const) : null;
        })();

    if (coincidencia) {
      omitir++;
      return { fila: f.fila, nombre: f.nombre, accion: 'OMITIR', coincideCon: coincidencia, errores: [] };
    }
    nuevas.push(datos);
    return { fila: f.fila, nombre: f.nombre, accion: 'CREAR', coincideCon: null, errores: [] };
  });

  const conErrores = reporteFilas.filter((f) => f.errores.length > 0).length;
  return {
    nuevas,
    reporte: {
      resumen: {
        total: reporteFilas.length,
        validas: reporteFilas.length - conErrores,
        conErrores,
        crear: nuevas.length,
        omitir,
      },
      filas: reporteFilas,
    },
  };
}

export async function previsualizarInstituciones(usuario: AuthUser, archivo: Buffer): Promise<ReporteImportacion> {
  return (await analizar(prisma, usuario, archivo)).reporte;
}

export type ResultadoConfirmacion = { resumen: { creados: number; omitidos: number } };

// All-or-nothing: the file is re-validated from scratch inside the transaction and nothing is
// written when any row has errors. `generar` is injectable so the collision retry can be tested.
export async function confirmarInstituciones(
  usuario: AuthUser,
  archivo: Buffer,
  generar = generarCredencialesQr,
): Promise<ResultadoConfirmacion> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const { reporte, nuevas } = await analizar(tx, usuario, archivo);
        if (reporte.resumen.conErrores > 0) {
          throw new AppError(
            422,
            'IMPORTACION_CON_ERRORES',
            'El archivo tiene errores. Corrígelos y vuelve a subirlo; no se importó ninguna institución.',
            reporte,
          );
        }
        return await aplicar(tx, usuario, nuevas, reporte.resumen.omitir, generar);
      },
      // Up to 2000 rows: the default 5 s interactive timeout is too tight.
      { timeout: 60_000 },
    );
  } catch (err) {
    // Unique violation: another import created the same RFC between our check and our write.
    if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002') {
      throw new AppError(409, 'IMPORTACION_CONFLICTO', 'Otro proceso modificó el catálogo. Vuelve a intentarlo.');
    }
    throw err;
  }
}

// One QR token (only its hash is stored, RNF-06) and short code (RF-15) per institution. A unique
// violation inside a transaction aborts it, so collisions are resolved before writing.
async function credenciales(tx: Tx, cantidad: number, generar: typeof generarCredencialesQr) {
  const resultado: ReturnType<typeof generarCredencialesQr>[] = [];
  const hashes = new Set<string>();
  const codigos = new Set<string>();
  for (let i = 0; i < cantidad; i++) {
    for (let intento = 1; ; intento++) {
      const c = generar();
      const enArchivo = hashes.has(c.qrTokenHash) || codigos.has(c.codigoCorto);
      const enBase =
        !enArchivo &&
        (await tx.institucion.count({
          where: { OR: [{ qrTokenHash: c.qrTokenHash }, { codigoCorto: c.codigoCorto }] },
        })) > 0;
      if (!enArchivo && !enBase) {
        hashes.add(c.qrTokenHash);
        codigos.add(c.codigoCorto);
        resultado.push(c);
        break;
      }
      if (intento >= MAX_INTENTOS_QR) {
        throw new AppError(409, 'IMPORTACION_CONFLICTO', 'No se pudo generar un código único. Vuelve a intentarlo.');
      }
    }
  }
  return resultado;
}

async function aplicar(
  tx: Tx,
  usuario: AuthUser,
  nuevas: DatosInstitucion[],
  omitidas: number,
  generar: typeof generarCredencialesQr,
): Promise<ResultadoConfirmacion> {
  const claves = await credenciales(tx, nuevas.length, generar);
  const filas = nuevas.map((datos, i) => ({ id: randomUUID(), datos, qr: claves[i]! }));

  await tx.institucion.createMany({
    data: filas.map(({ id, datos, qr }) => ({
      ...columnasDe(datos),
      id,
      plantelId: usuario.plantelId,
      qrTokenHash: qr.qrTokenHash,
      codigoCorto: qr.codigoCorto,
    })),
  });
  await tx.institucionCarrera.createMany({
    data: filas.flatMap(({ id, datos }) => datos.carreraIds.map((carreraId) => ({ institucionId: id, carreraId }))),
  });

  // RF-29: counters plus the id and name of what was created; never the QR hash or contact data.
  await tx.auditLog.create({
    data: {
      usuarioId: usuario.id,
      accion: 'IMPORTAR_INSTITUCIONES',
      entidad: 'Importacion',
      entidadId: randomUUID(),
      despues: {
        creados: filas.length,
        omitidos: omitidas,
        instituciones: filas.map(({ id, datos }) => ({ id, nombre: datos.nombre })),
      },
    },
  });

  return { resumen: { creados: filas.length, omitidos: omitidas } };
}

// Every column of the institution except the carreras relation.
function columnasDe(datos: DatosInstitucion) {
  return Object.fromEntries(Object.entries(datos).filter(([campo]) => campo !== 'carreraIds')) as Omit<
    DatosInstitucion,
    'carreraIds'
  >;
}
