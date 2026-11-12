import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { avanceKeys } from '../avance/api';
import { historialKeys, type EstadoValidacion } from '../historial/api';

// Contract of PUT /api/semanas/:id/bitacora, POST /api/semanas/:id/enviar (task 0020) and
// GET /api/semanas/pendientes (task 0023). The server decides every rule (RN-17); the frontend only sends text.

export type MotivoPendiente = 'RECHAZADA' | 'BITACORA_PENDIENTE' | 'BITACORA_SEMANA_ACTUAL';

export type Pendiente = {
  id: string;
  semanaInicio: string;
  semanaFin: string;
  estado: EstadoValidacion;
  motivo: MotivoPendiente;
  comentario: string | null;
};

export type SemanaBitacora = {
  id: string;
  semanaInicio: string;
  estado: EstadoValidacion;
  actividades: string | null;
  enviadaEn: string | null;
  bitacoraActualizadaEn: string | null;
};

export const pendientesKeys = {
  all: ['pendientes'] as const,
};

export function usePendientes() {
  return useQuery({
    queryKey: pendientesKeys.all,
    queryFn: () => apiFetch<{ pendientes: Pendiente[] }>('/api/semanas/pendientes'),
    select: (data) => data.pendientes,
  });
}

// Saving or sending changes the week shown in the history, the pending list and the progress.
function useInvalidarSemana() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: historialKeys.all }),
      queryClient.invalidateQueries({ queryKey: pendientesKeys.all }),
      queryClient.invalidateQueries({ queryKey: avanceKeys.all }),
    ]);
}

export function useGuardarBitacora(semanaId: string) {
  const invalidar = useInvalidarSemana();
  return useMutation({
    mutationFn: (actividades: string) =>
      apiFetch<{ semana: SemanaBitacora }>(`/api/semanas/${semanaId}/bitacora`, {
        method: 'PUT',
        body: JSON.stringify({ actividades }),
      }),
    onSuccess: invalidar,
  });
}

export function useEnviarSemana(semanaId: string) {
  const invalidar = useInvalidarSemana();
  return useMutation({
    mutationFn: () => apiFetch<{ semana: SemanaBitacora }>(`/api/semanas/${semanaId}/enviar`, { method: 'POST' }),
    onSuccess: invalidar,
  });
}
