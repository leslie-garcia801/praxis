import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// Contract of GET /api/asistencias?semana= (backend/src/modules/asistencias, task 0015).
// The API groups the shifts, computes the minutes and applies the daily cap; the frontend only formats.

export type EstadoTurno = 'ABIERTA' | 'CERRADA' | 'INCOMPLETA';
export type EstadoValidacion = 'BORRADOR' | 'ENVIADA' | 'VALIDADA' | 'RECHAZADA';

export type Turno = {
  id: string;
  entrada: string;
  salida: string | null;
  estado: EstadoTurno;
  minutosAcreditables: number | null;
  sinConexion: boolean;
};

export type DiaHistorial = {
  fecha: string;
  turnos: Turno[];
  minutosDia: number;
  minutosAcreditablesDia: number;
};

export type SemanaHistorial = {
  inicio: string;
  fin: string;
  estadoValidacion: EstadoValidacion | null;
  // Logbook (RF-20, task 0020). `id` is null while the week has no shifts. `comentario` only when RECHAZADA.
  id: string | null;
  actividades: string | null;
  comentario: string | null;
  enviadaEn: string | null;
  puedeEditar: boolean;
  puedeEnviar: boolean;
  dias: DiaHistorial[];
  totales: { minutos: number; minutosAcreditables: number };
};

export const historialKeys = {
  all: ['historial'] as const,
  semana: (semana: string | undefined) => [...historialKeys.all, semana ?? 'actual'] as const,
};

// Without `semana` the API answers with the current week (Monterrey time).
export function useHistorial(semana?: string) {
  return useQuery({
    queryKey: historialKeys.semana(semana),
    queryFn: () =>
      apiFetch<{ semana: SemanaHistorial }>(
        semana ? `/api/asistencias?semana=${encodeURIComponent(semana)}` : '/api/asistencias',
      ),
    select: (data) => data.semana,
    placeholderData: keepPreviousData,
  });
}
