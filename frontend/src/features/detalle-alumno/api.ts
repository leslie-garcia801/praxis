import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { EstadoExpediente } from '../expediente/api';
import type { TipoPrograma } from '../instituciones/api';

// Contract of GET /api/expedientes/:id as vinculación sees it (backend task 0012): it includes the
// student and the supervisor's contact data, which the student view omits.

export type Turno = 'MATUTINO' | 'VESPERTINO';

export type SupervisorDetalle = {
  id: string;
  titulo: string | null;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  puesto: string | null;
  correo?: string;
  telefono?: string | null;
  confirmado: boolean;
};

export type ExpedienteDetalle = {
  id: string;
  tipo: TipoPrograma;
  estado: EstadoExpediente;
  metaHoras: number;
  departamento: string | null;
  fechaInicio: string | null;
  fechaTermino: string | null;
  programa: string | null;
  institucion: { id: string; nombre: string } | null;
  supervisor: SupervisorDetalle | null;
  faltantes: string[];
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
};

export const detalleKeys = {
  all: ['expediente-detalle'] as const,
  detalle: (id: string) => [...detalleKeys.all, id] as const,
};

export function useExpedienteDetalle(id: string) {
  return useQuery({
    queryKey: detalleKeys.detalle(id),
    queryFn: () => apiFetch<{ expediente: ExpedienteDetalle }>(`/api/expedientes/${id}`),
    select: (data) => data.expediente,
  });
}

// RF-04: the temporary password is returned once and never cached.
export function useRestablecerContrasena(alumnoId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ passwordTemporal: string }>(`/api/alumnos/${alumnoId}/restablecer-contrasena`, { method: 'POST' }),
  });
}
