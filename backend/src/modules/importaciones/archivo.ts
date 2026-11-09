// Reads an uploaded .xlsx or .csv into a table of cell texts. Pure: no Express or Prisma.
import * as XLSX from 'xlsx';
import { AppError } from '../../lib/errors.js';

const ARCHIVO_INVALIDO = () =>
  new AppError(400, 'ARCHIVO_INVALIDO', 'No se pudo leer el archivo. Sube un .xlsx o un .csv con la plantilla.');

export type Tabla = string[][];

// ZIP container (xlsx) starts with "PK".
function esZip(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

// Format is detected by content, not by file name or MIME type.
export function leerTabla(buffer: Buffer): Tabla {
  if (buffer.length === 0) throw ARCHIVO_INVALIDO();
  return esZip(buffer) ? leerXlsx(buffer) : leerCsv(buffer);
}

function celdaATexto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  // Numbers are stringified directly: a 14-digit control number stays exact (no scientific notation).
  return String(valor).trim();
}

function leerXlsx(buffer: Buffer): Tabla {
  try {
    const libro = XLSX.read(buffer, { type: 'buffer' });
    const nombre = libro.SheetNames[0];
    const hoja = nombre ? libro.Sheets[nombre] : undefined;
    if (!hoja) throw ARCHIVO_INVALIDO();
    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: '', blankrows: true });
    return filas.map((fila) => fila.map(celdaATexto));
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw ARCHIVO_INVALIDO();
  }
}

function leerCsv(buffer: Buffer): Tabla {
  // Legacy binary formats (.xls) and other binaries contain NUL bytes.
  if (buffer.includes(0)) throw ARCHIVO_INVALIDO();
  const texto = buffer.toString('utf8');
  const contenido = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const primeraLinea = contenido.split(/\r?\n/, 1)[0] ?? '';
  // Excel in Spanish locale writes ";"; elsewhere ",".
  const delimitador = contarFuera(primeraLinea, ';') > contarFuera(primeraLinea, ',') ? ';' : ',';
  return parsearCsv(contenido, delimitador);
}

function contarFuera(linea: string, caracter: string): number {
  let dentro = false;
  let total = 0;
  for (const c of linea) {
    if (c === '"') dentro = !dentro;
    else if (c === caracter && !dentro) total++;
  }
  return total;
}

// RFC 4180 subset: quoted fields, doubled quotes, CRLF or LF.
function parsearCsv(contenido: string, delimitador: string): Tabla {
  const filas: Tabla = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;

  const cerrarCampo = () => {
    fila.push(campo.trim());
    campo = '';
  };
  const cerrarFila = () => {
    cerrarCampo();
    filas.push(fila);
    fila = [];
  };

  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i]!;
    if (entreComillas) {
      if (c === '"' && contenido[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === delimitador) cerrarCampo();
    else if (c === '\n') cerrarFila();
    else if (c !== '\r') campo += c;
  }
  if (campo !== '' || fila.length > 0) cerrarFila();

  return filas;
}

export function construirXlsx(filas: string[][], nombreHoja: string): Buffer {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), nombreHoja);
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}
