import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { avanceKeys } from '../avance/api';
import { detalleKeys } from '../detalle/api';
import { historialKeys, type EstadoTurno } from '../historial/api';
import { panelKeys } from '../panel/api';

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
  pendientes: () => [...correccionesKeys.all, 'pendientes'] as const,
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

// A row of the office queue (task 0038): the request with the shift as registered and the student.
export type CorreccionOficina = Correccion & {
  turno: { id: string; entrada: string; salida: string | null; estado: EstadoTurno; minutosAcreditables: number | null };
  expediente: { id: string; tipo: 'SERVICIO_SOCIAL' | 'PRACTICAS' };
  alumno: { nombre: string; matricula: string | null };
};

export type ResolverCorreccionInput = { accion: 'APROBAR' } | { accion: 'RECHAZAR'; comentario: string };

// The office's PENDIENTE requests (RN-03b: only its office), oldest first.
export function useCorreccionesPendientes() {
  return useQuery({
    queryKey: correccionesKeys.pendientes(),
    queryFn: () => apiFetch<{ correcciones: CorreccionOficina[] }>('/api/correcciones'),
    select: (data) => data.correcciones,
  });
}

// Approving changes the shift, its week and the progress; both actions add an audit entry.
export function useResolverCorreccion(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResolverCorreccionInput) =>
      apiFetch<{ correccion: Correccion }>(`/api/correcciones/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: correccionesKeys.all }),
        queryClient.invalidateQueries({ queryKey: detalleKeys.all }),
        queryClient.invalidateQueries({ queryKey: avanceKeys.all }),
        queryClient.invalidateQueries({ queryKey: panelKeys.all }),
      ]),
  });
}
