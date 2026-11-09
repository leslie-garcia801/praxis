import { apiFetch } from '@/lib/api';

// Contract of /api/importaciones/alumnos (backend/src/modules/importaciones). The file travels as the raw body.

export type FilaError = { campo: string; mensaje: string };

export type FilaReporte = {
  fila: number;
  matricula: string;
  accion: 'CREAR' | 'ACTUALIZAR' | null;
  errores: FilaError[];
};

export type ReporteImportacion = {
  resumen: { total: number; validas: number; conErrores: number; crear: number; actualizar: number };
  filas: FilaReporte[];
};

export type ResultadoImportacion = {
  resumen: { creados: number; actualizados: number; expedientesCreados: number };
};

export const MAX_BYTES = 2 * 1024 * 1024;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ACCEPTED_MIMES = [XLSX_MIME, 'text/csv', 'application/vnd.ms-excel', 'application/octet-stream'];

// apiFetch defaults to JSON, so the Content-Type must be explicit and one the backend accepts.
export function contentTypeFor(file: File): string {
  if (ACCEPTED_MIMES.includes(file.type)) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return XLSX_MIME;
  if (name.endsWith('.csv')) return 'text/csv';
  return 'application/octet-stream';
}

function sendFile<T>(path: string, file: File) {
  return apiFetch<T>(path, { method: 'POST', body: file, headers: { 'Content-Type': contentTypeFor(file) } });
}

export function previewAlumnos(file: File) {
  return sendFile<ReporteImportacion>('/api/importaciones/alumnos/preview', file);
}

export function confirmarAlumnos(file: File) {
  return sendFile<ResultadoImportacion>('/api/importaciones/alumnos/confirmar', file);
}

export function isReporte(value: unknown): value is ReporteImportacion {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { resumen?: unknown; filas?: unknown };
  return typeof v.resumen === 'object' && v.resumen !== null && Array.isArray(v.filas);
}
