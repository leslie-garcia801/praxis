import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { panelKeys } from '../panel/api';
import type { TipoPrograma, Turno } from '../instituciones/api';

// Contracts of GET /api/expedientes/candidatos and POST /api/expedientes/asignar (backend, task 0058).

export type Candidato = {
  alumnoId: string;
  nombre: string;
  matricula: string | null;
  carrera: string;
  semestre: number;
  grupo: string;
  turno: Turno;
  programaTerminado: TipoPrograma;
  // Calendar date 'YYYY-MM-DD' (Monterrey), or null when it cannot be known.
  terminadoEn: string | null;
  tipoAsignable: TipoPrograma;
};

export type ResultadoAsignacion = {
  asignados: { alumnoId: string; tipo: TipoPrograma; expedienteId: string }[];
  omitidos: { alumnoId: string; motivo: string }[];
};

export const candidatosKeys = {
  all: ['candidatos-asignacion'] as const,
};

export function useCandidatos() {
  return useQuery({
    queryKey: candidatosKeys.all,
    queryFn: () => apiFetch<{ candidatos: Candidato[] }>('/api/expedientes/candidatos'),
    select: (data) => data.candidatos,
    retry: false,
  });
}

// Assigning refreshes the candidates (the assigned ones leave the list) and the panel.
export function useAsignarPrograma() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alumnoIds: string[]) =>
      apiFetch<ResultadoAsignacion>('/api/expedientes/asignar', { method: 'POST', body: JSON.stringify({ alumnoIds }) }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: candidatosKeys.all }),
        queryClient.invalidateQueries({ queryKey: panelKeys.all }),
      ]),
  });
}
