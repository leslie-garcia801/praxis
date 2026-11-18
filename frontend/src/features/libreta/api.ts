import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { avanceKeys } from '../avance/api';
import { pendientesKeys } from '../bitacora/api';
import { historialKeys, type EstadoValidacion } from '../historial/api';

// Contract of POST /api/semanas/libreta and PUT /api/semanas/:id/libreta (RF-17a, task 0061).
// `fecha` is a Monterrey calendar date and `entrada`/`salida` are 'HH:MM' wall-clock times (RN-15).
// The server decides every rule (RN-19, RN-04); the frontend only sends what the student typed.

export type TurnoLibretaEnvio = { id: string; fecha: string; entrada: string; salida: string };

export type SemanaLibreta = {
  id: string;
  semanaInicio: string;
  semanaFin: string;
  estado: EstadoValidacion;
  deLibreta: true;
  enviadaEn: string;
  minutosAcreditables: number;
  turnos: { id: string; entrada: string; salida: string; origen: 'LIBRETA'; minutosAcreditables: number }[];
};

// Per-row 409 errors: `index` is the position of the row in the request.
export type ErrorFilaLibreta = { index: number; code: string; message: string };

// Sending changes the history, the pending list and the progress.
function useInvalidarLibreta() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: historialKeys.all }),
      queryClient.invalidateQueries({ queryKey: pendientesKeys.all }),
      queryClient.invalidateQueries({ queryKey: avanceKeys.all }),
    ]);
}

export function useEnviarLibreta() {
  const invalidar = useInvalidarLibreta();
  return useMutation({
    mutationFn: (turnos: TurnoLibretaEnvio[]) =>
      apiFetch<{ semanas: SemanaLibreta[] }>('/api/semanas/libreta', { method: 'POST', body: JSON.stringify({ turnos }) }),
    onSuccess: invalidar,
  });
}

export function useCorregirLibreta(semanaId: string) {
  const invalidar = useInvalidarLibreta();
  return useMutation({
    mutationFn: (turnos: TurnoLibretaEnvio[]) =>
      apiFetch<{ semana: SemanaLibreta }>(`/api/semanas/${semanaId}/libreta`, { method: 'PUT', body: JSON.stringify({ turnos }) }),
    onSuccess: invalidar,
  });
}

export function erroresPorFila(details: unknown): Record<number, string> {
  const porFila: Record<number, string> = {};
  if (!Array.isArray(details)) return porFila;
  for (const d of details as Partial<ErrorFilaLibreta>[]) {
    if (typeof d?.index === 'number' && typeof d.message === 'string' && porFila[d.index] === undefined) {
      porFila[d.index] = d.message;
    }
  }
  return porFila;
}
