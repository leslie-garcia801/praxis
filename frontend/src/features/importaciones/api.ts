import { sendFile, type FilaError } from './archivo';

// Contract of /api/importaciones/alumnos (backend/src/modules/importaciones). The file travels as the raw body.

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

export function previewAlumnos(file: File) {
  return sendFile<ReporteImportacion>('/api/importaciones/alumnos/preview', file);
}

export function confirmarAlumnos(file: File) {
  return sendFile<ResultadoImportacion>('/api/importaciones/alumnos/confirmar', file);
}
