import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { avanceKeys } from '../avance/api';
import { meKey } from '../auth/api';
import type { TipoPrograma } from '../instituciones/api';

// Contract of /api/expedientes/:id and /api/instituciones/:id/supervisores (backend, task 0012).
// The student view of a supervisor has no correo, teléfono or extensión.

export type EstadoExpediente = 'PENDIENTE' | 'EN_PROCESO' | 'SUSPENDIDO' | 'FINALIZADO' | 'CANCELADO';

export type Supervisor = {
  id: string;
  institucionId: string;
  titulo: string | null;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  puesto: string | null;
  departamento: string | null;
  confirmado: boolean;
};

export type Expediente = {
  id: string;
  tipo: TipoPrograma;
  estado: EstadoExpediente;
  departamento: string | null;
  fechaInicio: string | null;
  fechaTermino: string | null;
  diasPactados: number[];
  horaEntrada: string | null;
  horaSalida: string | null;
  programa: string | null;
  subprograma: string | null;
  institucion: { id: string; nombre: string } | null;
  supervisor: Supervisor | null;
  faltantes: string[];
};

// Body of PATCH /api/expedientes/:id. Strict on the backend: only send the fields of the expediente type.
export type EditarExpedienteInput = {
  institucionId?: string;
  supervisorId?: string | null;
  departamento?: string | null;
  fechaInicio?: string;
  fechaTermino?: string | null;
  diasPactados?: number[];
  horaEntrada?: string | null;
  horaSalida?: string | null;
  programa?: string | null;
  subprograma?: string | null;
};

// Body of POST /api/instituciones/:id/supervisores. Optional fields are omitted when empty.
export type CrearSupervisorInput = {
  nombre: string;
  apellidoPaterno: string;
  correo: string;
  titulo?: string;
  apellidoMaterno?: string;
  puesto?: string;
  departamento?: string;
  telefono?: string;
  extension?: string;
};

export const expedienteKeys = {
  all: ['expediente'] as const,
  detalle: (id: string) => [...expedienteKeys.all, id] as const,
};

export const supervisoresKeys = {
  all: ['supervisores'] as const,
  lista: (institucionId: string) => [...supervisoresKeys.all, institucionId] as const,
};

export function useExpediente(id: string | undefined) {
  return useQuery({
    queryKey: expedienteKeys.detalle(id ?? ''),
    queryFn: () => apiFetch<{ expediente: Expediente }>(`/api/expedientes/${id}`),
    select: (data) => data.expediente,
    enabled: id !== undefined,
  });
}

// Saving refreshes `me` (the active expediente summary), the expediente itself and the progress.
export function useGuardarExpediente(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EditarExpedienteInput) =>
      apiFetch<{ expediente: Expediente }>(`/api/expedientes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meKey }),
        queryClient.invalidateQueries({ queryKey: expedienteKeys.detalle(id) }),
        queryClient.invalidateQueries({ queryKey: avanceKeys.detalle(id) }),
      ]);
    },
  });
}

export function useSupervisores(institucionId: string | undefined) {
  return useQuery({
    queryKey: supervisoresKeys.lista(institucionId ?? ''),
    queryFn: () => apiFetch<{ supervisores: Supervisor[] }>(`/api/instituciones/${institucionId}/supervisores`),
    select: (data) => data.supervisores,
    enabled: institucionId !== undefined,
  });
}

export function useCrearSupervisor(institucionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearSupervisorInput) =>
      apiFetch<{ supervisor: Supervisor }>(`/api/instituciones/${institucionId}/supervisores`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supervisoresKeys.lista(institucionId) }),
  });
}
