// Student import (RF-01): header matching and per-row validation. Pure: no Express or Prisma.
import { z } from 'zod';
import { normalizarNombre } from '../../domain/nombres.js';
import type { TipoPrograma } from '../../domain/oficinas.js';
import { AppError } from '../../lib/errors.js';
import type { Tabla } from './archivo.js';

export const MAX_FILAS = 2000;

// Template order. `campo` is the internal field name used in error reports.
export const COLUMNAS_ALUMNOS = [
  { campo: 'matricula', encabezado: 'Número de control' },
  { campo: 'nombre', encabezado: 'Nombre' },
  { campo: 'apellidoPaterno', encabezado: 'Apellido paterno' },
  { campo: 'apellidoMaterno', encabezado: 'Apellido materno' },
  { campo: 'carrera', encabezado: 'Carrera' },
  { campo: 'semestre', encabezado: 'Semestre' },
  { campo: 'grupo', encabezado: 'Grupo' },
  { campo: 'turno', encabezado: 'Turno' },
  { campo: 'tipo', encabezado: 'Tipo' },
] as const;

export const ENCABEZADOS_ALUMNOS: string[] = COLUMNAS_ALUMNOS.map((c) => c.encabezado);

type Campo = (typeof COLUMNAS_ALUMNOS)[number]['campo'];
export type FilaCruda = Record<Campo, string>;
export type FilaExtraida = { fila: number; valores: FilaCruda };

export type ErrorFila = { campo: string; mensaje: string };

export type DatosAlumno = {
  matricula: string;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  carreraId: string;
  semestre: number;
  grupo: string;
  turno: 'MATUTINO' | 'VESPERTINO';
  tipo: TipoPrograma;
};

export type FilaValidada = {
  /** Spreadsheet row number (the header is row 1). */
  fila: number;
  /** Raw text of the control number, as uploaded (for the report). */
  matricula: string;
  datos: DatosAlumno | null;
  errores: ErrorFila[];
};

// Header and catalog matching ignores case, accents and repeated spaces.
const normalizar = normalizarNombre;

/**
 * Maps the table to raw rows keyed by field. Extra columns are dropped here, so they can never
 * be stored (RNF-07). Fully empty rows are skipped.
 */
export function extraerFilas(tabla: Tabla): FilaExtraida[] {
  const [encabezados, ...datos] = tabla;
  if (!encabezados) throw new AppError(400, 'ARCHIVO_INVALIDO', 'El archivo no tiene encabezados.');

  const indices = new Map<string, number>();
  encabezados.forEach((texto, i) => {
    const clave = normalizar(texto);
    if (!indices.has(clave)) indices.set(clave, i);
  });

  const faltantes = COLUMNAS_ALUMNOS.filter((c) => !indices.has(normalizar(c.encabezado)));
  if (faltantes.length > 0) {
    const lista = faltantes.map((c) => c.encabezado);
    throw new AppError(400, 'COLUMNAS_FALTANTES', `Faltan columnas en el archivo: ${lista.join(', ')}.`, {
      columnas: lista,
    });
  }

  const filas: FilaExtraida[] = [];
  datos.forEach((celdas, i) => {
    const valores = Object.fromEntries(
      COLUMNAS_ALUMNOS.map((c) => [c.campo, (celdas[indices.get(normalizar(c.encabezado))!] ?? '').trim()]),
    ) as FilaCruda;
    if (Object.values(valores).every((v) => v === '')) return;
    filas.push({ fila: i + 2, valores });
  });

  if (filas.length === 0) {
    throw new AppError(400, 'ARCHIVO_INVALIDO', 'El archivo no tiene filas de alumnos.');
  }
  if (filas.length > MAX_FILAS) {
    throw new AppError(
      400,
      'ARCHIVO_DEMASIADO_GRANDE',
      `El archivo tiene más de ${MAX_FILAS} filas. Divídelo en varios archivos.`,
    );
  }
  return filas;
}

const TURNOS: Record<string, DatosAlumno['turno']> = { matutino: 'MATUTINO', vespertino: 'VESPERTINO' };
const TIPOS: Record<string, TipoPrograma> = {
  'servicio social': 'SERVICIO_SOCIAL',
  practicas: 'PRACTICAS',
  'practicas profesionales': 'PRACTICAS',
};

const requerido = (mensaje: string) => z.string().min(1, mensaje);

/** Builds the row schema. `carreras` maps the normalized career name to its id. */
export function crearEsquemaFila(carreras: ReadonlyMap<string, string>) {
  return z.object({
    matricula: z.string().regex(/^\d{14}$/, 'El número de control debe tener exactamente 14 dígitos.'),
    nombre: requerido('El nombre es obligatorio.'),
    apellidoPaterno: requerido('El apellido paterno es obligatorio.'),
    apellidoMaterno: z.string().transform((v) => (v === '' ? null : v)),
    carrera: requerido('La carrera es obligatoria.').transform((v, ctx) => {
      const id = carreras.get(normalizar(v));
      if (!id) {
        ctx.issues.push({ code: 'custom', message: `Carrera desconocida: "${v}".`, input: v });
        return z.NEVER;
      }
      return id;
    }),
    semestre: z
      .string()
      .regex(/^\d+$/, 'El semestre debe ser un número entero.')
      .transform(Number)
      .refine((n) => n >= 5, 'El alumno debe cursar 5.º semestre o superior (RN-01).')
      .refine((n) => n <= 12, 'El semestre no puede ser mayor a 12.'),
    grupo: requerido('El grupo es obligatorio.').transform((v) => v.toUpperCase()),
    turno: z.string().transform((v, ctx) => {
      const turno = TURNOS[normalizar(v)];
      if (!turno) {
        ctx.issues.push({ code: 'custom', message: 'El turno debe ser Matutino o Vespertino.', input: v });
        return z.NEVER;
      }
      return turno;
    }),
    tipo: z.string().transform((v, ctx) => {
      const tipo = TIPOS[normalizar(v)];
      if (!tipo) {
        ctx.issues.push({ code: 'custom', message: 'El tipo debe ser Servicio social o Prácticas.', input: v });
        return z.NEVER;
      }
      return tipo;
    }),
  });
}

/** Validates every row and flags control numbers repeated inside the file. */
export function validarFilas(filas: FilaExtraida[], carreras: ReadonlyMap<string, string>): FilaValidada[] {
  const esquema = crearEsquemaFila(carreras);

  const resultado = filas.map(({ fila, valores }): FilaValidada => {
    const parsed = esquema.safeParse(valores);
    if (parsed.success) {
      const { carrera, ...resto } = parsed.data;
      return { fila, matricula: valores.matricula, datos: { ...resto, carreraId: carrera }, errores: [] };
    }
    // One message per field: the first issue of each.
    const porCampo = new Map<string, string>();
    for (const issue of parsed.error.issues) {
      const campo = String(issue.path[0] ?? 'fila');
      if (!porCampo.has(campo)) porCampo.set(campo, issue.message);
    }
    const errores = [...porCampo].map(([campo, mensaje]) => ({ campo, mensaje }));
    return { fila, matricula: valores.matricula, datos: null, errores };
  });

  // Duplicates are checked on well-formed control numbers only.
  const filasPorMatricula = new Map<string, number[]>();
  for (const r of resultado) {
    if (/^\d{14}$/.test(r.matricula)) {
      filasPorMatricula.set(r.matricula, [...(filasPorMatricula.get(r.matricula) ?? []), r.fila]);
    }
  }
  for (const r of resultado) {
    const repetidas = filasPorMatricula.get(r.matricula);
    if (repetidas && repetidas.length > 1) {
      r.datos = null;
      r.errores.unshift({
        campo: 'matricula',
        mensaje: `Número de control repetido en el archivo (filas ${repetidas.join(', ')}).`,
      });
    }
  }

  return resultado;
}

export function indexarCarreras(carreras: readonly { id: string; nombre: string }[]): Map<string, string> {
  return new Map(carreras.map((c) => [normalizar(c.nombre), c.id]));
}
