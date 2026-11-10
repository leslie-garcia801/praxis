// Institution import (RF-07): header matching and per-row validation. Pure: no Express or Prisma.
import { normalizarNombre } from '../../domain/nombres.js';
import { AppError } from '../../lib/errors.js';
import { crearInstitucionSchema, type CrearInstitucionInput } from '../instituciones/instituciones.schemas.js';
import { MAX_FILAS, type ErrorFila } from './alumnos.parser.js';
import type { Tabla } from './archivo.js';

// Template order. `campo` is the internal field name used in error reports.
export const COLUMNAS_INSTITUCIONES = [
  { campo: 'nombre', encabezado: 'Nombre' },
  { campo: 'rfc', encabezado: 'RFC' },
  { campo: 'giro', encabezado: 'Giro' },
  { campo: 'calle', encabezado: 'Calle' },
  { campo: 'numExterior', encabezado: 'Número exterior' },
  { campo: 'numInterior', encabezado: 'Número interior' },
  { campo: 'colonia', encabezado: 'Colonia' },
  { campo: 'codigoPostal', encabezado: 'Código postal' },
  { campo: 'municipio', encabezado: 'Municipio' },
  { campo: 'estado', encabezado: 'Estado' },
  { campo: 'telefono', encabezado: 'Teléfono' },
  { campo: 'correo', encabezado: 'Correo' },
  { campo: 'representante', encabezado: 'Representante' },
  { campo: 'horarioAtencion', encabezado: 'Horario de atención' },
  { campo: 'turnos', encabezado: 'Turnos' },
  { campo: 'aceptaServicio', encabezado: 'Acepta servicio' },
  { campo: 'aceptaPracticas', encabezado: 'Acepta prácticas' },
  { campo: 'cupo', encabezado: 'Cupo' },
  { campo: 'carreras', encabezado: 'Carreras' },
] as const;

export const ENCABEZADOS_INSTITUCIONES: string[] = COLUMNAS_INSTITUCIONES.map((c) => c.encabezado);

type Campo = (typeof COLUMNAS_INSTITUCIONES)[number]['campo'];
export type FilaCruda = Record<Campo, string>;
export type FilaExtraida = { fila: number; valores: FilaCruda };

export type DatosInstitucion = CrearInstitucionInput;

export type FilaValidada = {
  /** Spreadsheet row number (the header is row 1). */
  fila: number;
  /** Raw name as uploaded (for the report). */
  nombre: string;
  datos: DatosInstitucion | null;
  errores: ErrorFila[];
};

const normalizar = normalizarNombre;

/**
 * Maps the table to raw rows keyed by field. Extra columns are dropped here, so they can never
 * be stored. Fully empty rows are skipped.
 */
export function extraerFilas(tabla: Tabla): FilaExtraida[] {
  const [encabezados, ...datos] = tabla;
  if (!encabezados) throw new AppError(400, 'ARCHIVO_INVALIDO', 'El archivo no tiene encabezados.');

  const indices = new Map<string, number>();
  encabezados.forEach((texto, i) => {
    const clave = normalizar(texto);
    if (!indices.has(clave)) indices.set(clave, i);
  });

  const faltantes = COLUMNAS_INSTITUCIONES.filter((c) => !indices.has(normalizar(c.encabezado)));
  if (faltantes.length > 0) {
    const lista = faltantes.map((c) => c.encabezado);
    throw new AppError(400, 'COLUMNAS_FALTANTES', `Faltan columnas en el archivo: ${lista.join(', ')}.`, {
      columnas: lista,
    });
  }

  const filas: FilaExtraida[] = [];
  datos.forEach((celdas, i) => {
    const valores = Object.fromEntries(
      COLUMNAS_INSTITUCIONES.map((c) => [c.campo, (celdas[indices.get(normalizar(c.encabezado))!] ?? '').trim()]),
    ) as FilaCruda;
    if (Object.values(valores).every((v) => v === '')) return;
    filas.push({ fila: i + 2, valores });
  });

  if (filas.length === 0) {
    throw new AppError(400, 'ARCHIVO_INVALIDO', 'El archivo no tiene filas de instituciones.');
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

const TURNOS: Record<string, 'MATUTINO' | 'VESPERTINO'> = { matutino: 'MATUTINO', vespertino: 'VESPERTINO' };

const lista = (celda: string) =>
  celda
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');

export function indexarCarreras(carreras: readonly { id: string; nombre: string }[]): Map<string, string> {
  return new Map(carreras.map((c) => [normalizar(c.nombre), c.id]));
}

const vacioAUndefined = (v: string) => (v === '' ? undefined : v);

/** Validates one raw row: cell-level parsing first, then the same schema as POST /api/instituciones. */
function validarFila(valores: FilaCruda, carreras: ReadonlyMap<string, string>) {
  const errores = new Map<string, string>();
  const error = (campo: string, mensaje: string) => {
    if (!errores.has(campo)) errores.set(campo, mensaje);
  };

  const turnosDesconocidos: string[] = [];
  const turnos: ('MATUTINO' | 'VESPERTINO')[] = [];
  for (const t of lista(valores.turnos)) {
    const turno = TURNOS[normalizar(t)];
    if (turno) turnos.push(turno);
    else turnosDesconocidos.push(t);
  }
  if (turnosDesconocidos.length > 0) {
    error('turnos', `Turno desconocido: ${turnosDesconocidos.map((t) => `"${t}"`).join(', ')}. Usa Matutino o Vespertino.`);
  }

  const carreraIds: string[] = [];
  const carrerasDesconocidas: string[] = [];
  for (const c of lista(valores.carreras)) {
    const id = carreras.get(normalizar(c));
    if (id) carreraIds.push(id);
    else carrerasDesconocidas.push(c);
  }
  if (carrerasDesconocidas.length > 0) {
    error('carreras', `Carrera desconocida: ${carrerasDesconocidas.map((c) => `"${c}"`).join(', ')}.`);
  }

  const booleano = (campo: 'aceptaServicio' | 'aceptaPracticas'): boolean | undefined => {
    const clave = normalizar(valores[campo]);
    if (clave === '') return undefined;
    if (clave === 'si') return true;
    if (clave === 'no') return false;
    error(campo, 'Escribe Sí o No.');
    return undefined;
  };
  const aceptaServicio = booleano('aceptaServicio');
  const aceptaPracticas = booleano('aceptaPracticas');

  let cupo: number | undefined;
  if (valores.cupo !== '') {
    if (/^\d+$/.test(valores.cupo)) cupo = Number(valores.cupo);
    else error('cupo', 'El cupo debe ser un número entero mayor o igual a 0.');
  }

  const parsed = crearInstitucionSchema.safeParse({
    nombre: valores.nombre,
    rfc: valores.rfc,
    giro: valores.giro,
    calle: valores.calle,
    numExterior: valores.numExterior,
    numInterior: valores.numInterior,
    colonia: valores.colonia,
    codigoPostal: valores.codigoPostal,
    municipio: valores.municipio,
    estado: vacioAUndefined(valores.estado),
    telefono: valores.telefono,
    correo: vacioAUndefined(valores.correo),
    representante: valores.representante,
    horarioAtencion: valores.horarioAtencion,
    turnos,
    aceptaServicio,
    aceptaPracticas,
    cupo,
    carreraIds,
  });
  if (!parsed.success) {
    // One message per field: the first issue of each.
    for (const issue of parsed.error.issues) {
      error(String(issue.path[0] ?? 'fila'), issue.message);
    }
  }

  return {
    datos: errores.size === 0 && parsed.success ? parsed.data : null,
    errores: [...errores].map(([campo, mensaje]) => ({ campo, mensaje })),
  };
}

/** Validates every row and flags a later row repeating an RFC or a normalized name from the file. */
export function validarFilas(filas: FilaExtraida[], carreras: ReadonlyMap<string, string>): FilaValidada[] {
  const rfcs = new Map<string, number>();
  const nombres = new Map<string, number>();

  return filas.map(({ fila, valores }): FilaValidada => {
    const { datos, errores } = validarFila(valores, carreras);
    const rfc = valores.rfc.toUpperCase();
    const nombreNormalizado = normalizar(valores.nombre);

    const repetidos: ErrorFila[] = [];
    if (rfc !== '') {
      const previa = rfcs.get(rfc);
      if (previa === undefined) rfcs.set(rfc, fila);
      else repetidos.push({ campo: 'rfc', mensaje: `RFC repetido en el archivo (ya aparece en la fila ${previa}).` });
    }
    if (nombreNormalizado !== '') {
      const previa = nombres.get(nombreNormalizado);
      if (previa === undefined) nombres.set(nombreNormalizado, fila);
      else repetidos.push({ campo: 'nombre', mensaje: `Nombre repetido en el archivo (ya aparece en la fila ${previa}).` });
    }

    return {
      fila,
      nombre: valores.nombre,
      datos: repetidos.length > 0 ? null : datos,
      errores: [...repetidos, ...errores],
    };
  });
}
