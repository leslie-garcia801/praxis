import { ApiError, apiFetch } from '@/lib/api';

// Raw-file upload helpers shared by every import screen (alumnos, instituciones).

export type FilaError = { campo: string; mensaje: string };

export const MAX_BYTES = 2 * 1024 * 1024;
export const TOO_BIG_MESSAGE = 'El archivo pesa más de 2 MB. Divide la lista en archivos más pequeños.';

const GENERIC_MESSAGE = 'No se pudo completar la solicitud. Intenta de nuevo.';

export function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : GENERIC_MESSAGE;
}

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

export function sendFile<T>(path: string, file: File) {
  return apiFetch<T>(path, { method: 'POST', body: file, headers: { 'Content-Type': contentTypeFor(file) } });
}

// A 422 carries the fresh report in `details`: it has a summary and a list of rows.
export function isReporte<T extends { resumen: object; filas: unknown[] }>(value: unknown): value is T {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { resumen?: unknown; filas?: unknown };
  return typeof v.resumen === 'object' && v.resumen !== null && Array.isArray(v.filas);
}
