import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { SemanaHistorial } from '../historial/api';
import type { Expediente } from '../expediente/api';
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

export function useAuditoria(id: string) {
  return useQuery({
    queryKey: detalleKeys.auditoria(id),
    queryFn: () => apiFetch<Auditoria>(`/api/expedientes/${id}/auditoria`),
  });
}
