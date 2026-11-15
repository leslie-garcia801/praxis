import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { historialKeys } from '../historial/api';

// Contract of POST /api/asistencias/:id/correcciones (task 0037) and GET /api/correcciones (task 0038).
// The server decides every rule (RF-17); the frontend only sends what the student typed.

export type EstadoCorreccion = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export type Correccion = {
  id: string;
  asistenciaId: string;
  entradaNueva: string;
  salidaNueva: string;
  motivo: string;
  estado: EstadoCorreccion;
  // The office's reason, only when RECHAZADA.
  comentario: string | null;
  creadoEn: string;
  resueltoEn: string | null;
};

// A row of GET /api/correcciones: the request with the current shift (and, for the office, the student).
export type CorreccionConTurno = Correccion & {
  turno: { entrada: string };
};

export type SolicitudCorreccion = { entradaNueva: string; salidaNueva: string; motivo: string };

export const correccionesKeys = {
  all: ['correcciones'] as const,
  mias: () => [...correccionesKeys.all, 'mias'] as const,
};

// The student's own requests, newest first.
export function useMisCorrecciones() {
  return useQuery({
    queryKey: correccionesKeys.mias(),
    queryFn: () => apiFetch<{ correcciones: CorreccionConTurno[] }>('/api/correcciones'),
    select: (data) => data.correcciones,
  });
}

export function useSolicitarCorreccion(asistenciaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (solicitud: SolicitudCorreccion) =>
      apiFetch<{ correccion: Correccion }>(`/api/asistencias/${asistenciaId}/correcciones`, {
        method: 'POST',
        body: JSON.stringify(solicitud),
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: historialKeys.all }),
        queryClient.invalidateQueries({ queryKey: correccionesKeys.all }),
      ]),
  });
}
