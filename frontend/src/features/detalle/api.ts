import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { avanceKeys } from '../avance/api';
import type { SemanaHistorial } from '../historial/api';
import { supervisoresKeys, type Expediente } from '../expediente/api';
import { panelKeys } from '../panel/api';
import type { Turno } from '../instituciones/api';

// Contracts used by the office student detail (task 0030). The expediente, the progress and the week are already
// served by existing endpoints (the office reads them with the same permissions as the student, RN-03b).

// The office sees the contact data of the supervisor; the student never does.
export type SupervisorOficina = NonNullable<Expediente['supervisor']> & {
  correo: string | null;
  telefono: string | null;
  extension: string | null;
};

export type ExpedienteDetalle = Omit<Expediente, 'supervisor'> & {
  semestre: number;
  metaHoras: number;
  minutosTransferidos: number;
  alumno: {
    id: string;
    nombre: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    matricula: string | null;
    carrera: string;
    semestre: number;
    grupo: string;
    turno: Turno;
  };
  supervisor: SupervisorOficina | null;
};

// Contract of GET /api/expedientes/:id/auditoria (RF-29). Newest first, capped by `limite`.
export type EntradaAuditoria = {
  id: string;
  fecha: string;
  usuario: string;
  accion: string;
  entidad: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
};

export type Auditoria = { limite: number; truncado: boolean; entradas: EntradaAuditoria[] };

export const detalleKeys = {
  all: ['detalle-alumno'] as const,
  expediente: (id: string) => [...detalleKeys.all, id, 'expediente'] as const,
  semana: (id: string, semana: string | undefined) => [...detalleKeys.all, id, 'semana', semana ?? 'actual'] as const,
  auditoria: (id: string) => [...detalleKeys.all, id, 'auditoria'] as const,
};

export function useExpedienteDetalle(id: string) {
  return useQuery({
    queryKey: detalleKeys.expediente(id),
    queryFn: () => apiFetch<{ expediente: ExpedienteDetalle }>(`/api/expedientes/${id}`),
    select: (data) => data.expediente,
    retry: false,
  });
}

// RF-19: a week of the case file. Without `semana` the API answers with the current week (Monterrey time).
export function useSemanaDeExpediente(id: string, semana: string | undefined) {
  return useQuery({
    queryKey: detalleKeys.semana(id, semana),
    queryFn: () => {
      const params = new URLSearchParams({ expedienteId: id });
      if (semana) params.set('semana', semana);
      return apiFetch<{ semana: SemanaHistorial }>(`/api/asistencias?${params.toString()}`);
    },
    select: (data) => data.semana,
    placeholderData: keepPreviousData,
  });
}

// Every office action refreshes the detail (expediente, week, audit), the progress and the panel.
function useInvalidarDetalle() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: detalleKeys.all }),
      queryClient.invalidateQueries({ queryKey: avanceKeys.all }),
      queryClient.invalidateQueries({ queryKey: panelKeys.all }),
      queryClient.invalidateQueries({ queryKey: supervisoresKeys.all }),
    ]);
}

export type AccionEstado = 'SUSPENDER' | 'REACTIVAR' | 'CANCELAR';

// RF-11, RF-12: PATCH /api/expedientes/:id/estado. The reason is mandatory and audited.
export function useCambiarEstado(id: string) {
  const invalidar = useInvalidarDetalle();
  return useMutation({
    mutationFn: (input: { accion: AccionEstado; motivo: string }) =>
      apiFetch<{ expediente: ExpedienteDetalle }>(`/api/expedientes/${id}/estado`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: invalidar,
  });
}

// RF-10, RF-11: POST /api/expedientes/:id/confirmar (no body). 409 EXPEDIENTE_INCOMPLETO carries `details.faltantes`.
export function useConfirmarExpediente(id: string) {
  const invalidar = useInvalidarDetalle();
  return useMutation({
    mutationFn: () => apiFetch<{ expediente: ExpedienteDetalle }>(`/api/expedientes/${id}/confirmar`, { method: 'POST' }),
    onSuccess: invalidar,
  });
}

export type TransferirInput = { institucionId: string; conservarHoras: boolean; motivo: string };

// RN-12: POST /api/expedientes/:id/transferir answers { anterior, nuevo }.
export function useTransferirExpediente(id: string) {
  const invalidar = useInvalidarDetalle();
  return useMutation({
    mutationFn: (input: TransferirInput) =>
      apiFetch<{ anterior: { id: string }; nuevo: { id: string } }>(`/api/expedientes/${id}/transferir`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidar,
  });
}

export type ResolverSemanaInput =
  | { accion: 'VALIDAR'; motivo: string }
  | { accion: 'RECHAZAR'; motivo: string; comentario: string };

// RF-22: POST /api/semanas/:id/validacion, the office acting on behalf of the supervisor.
export function useResolverSemanaOficina(semanaId: string) {
  const invalidar = useInvalidarDetalle();
  return useMutation({
    mutationFn: (input: ResolverSemanaInput) =>
      apiFetch<{ semana: { id: string; estado: string } }>(`/api/semanas/${semanaId}/validacion`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidar,
  });
}

// RF-09: PATCH /api/supervisores/:id. Optional fields are sent as null to clear them.
export type EditarSupervisorInput = {
  titulo: string | null;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  puesto: string | null;
  departamento: string | null;
  correo: string;
  telefono: string | null;
  extension: string | null;
};

export function useEditarSupervisor(supervisorId: string) {
  const invalidar = useInvalidarDetalle();
  return useMutation({
    mutationFn: (input: EditarSupervisorInput) =>
      apiFetch<{ supervisor: unknown }>(`/api/supervisores/${supervisorId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: invalidar,
  });
}

export function useAuditoria(id: string) {
  return useQuery({
    queryKey: detalleKeys.auditoria(id),
    queryFn: () => apiFetch<Auditoria>(`/api/expedientes/${id}/auditoria`),
  });
}
