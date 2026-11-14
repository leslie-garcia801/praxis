// Builds an .xlsx file from rows of cells. Pure: no Express or Prisma.
import * as XLSX from 'xlsx';

export type Celda = string | number | null;

export type OpcionesXlsx = {
  /** Width of each column, in characters. */
  anchos?: number[];
  /** Zero-based columns whose cells are always written as text (control numbers, with leading zeros kept). */
  columnasTexto?: number[];
};

export function construirXlsx(filas: Celda[][], nombreHoja: string, { anchos, columnasTexto = [] }: OpcionesXlsx = {}): Buffer {
  const hoja = XLSX.utils.aoa_to_sheet(
    filas.map((fila) => fila.map((celda, i) => (celda !== null && columnasTexto.includes(i) ? String(celda) : celda))),
  );
  if (anchos) hoja['!cols'] = anchos.map((wch) => ({ wch }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}
