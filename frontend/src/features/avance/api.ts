import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// Contract of GET /api/expedientes/:id/avance (backend/src/modules/expedientes, task 0015).
// Everything is computed by the API; the frontend only formats it.

export type FechaEstimada =
  | { tipo: 'COMPLETADO' }
  | { tipo: 'SIN_DATOS' }
  | { tipo: 'ESTIMADA'; fecha: string; promedioMinutosDia: number };

export type Avance = {
  expedienteId: string;
  metaMinutos: number;
  minutosValidados: number;
  minutosRegistrados: number;
  minutosFaltantes: number;
  porcentaje: number;
  fechaEstimada: FechaEstimada;
  turnoAbierto: { id: string; entrada: string } | null;
};

export const avanceKeys = {
  all: ['avance'] as const,
  detalle: (expedienteId: string) => [...avanceKeys.all, expedienteId] as const,
};

export function useAvance(expedienteId: string) {
  return useQuery({
    queryKey: avanceKeys.detalle(expedienteId),
    queryFn: () => apiFetch<{ avance: Avance }>(`/api/expedientes/${expedienteId}/avance`),
    select: (data) => data.avance,
  });
}
