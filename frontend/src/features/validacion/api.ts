import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// Contract of GET/POST /api/validacion/:token (task 0021). Public routes: no session. The server decides
// every rule (RF-21, RF-22); the frontend only shows the data and sends the supervisor's decisions.

export type EstadoSemanaValidacion = 'ENVIADA' | 'VALIDADA' | 'RECHAZADA';

export type TurnoValidacion = {
  entrada: string;
  salida: string | null;
  estado: string;
  minutosAcreditables: number | null;
  fueraDeHorario: boolean;
};

export type SemanaValidacion = {
  id: string;
  alumno: { nombre: string; carrera: string };
  institucion: string;
  semanaInicio: string;
  semanaFin: string;
  estado: EstadoSemanaValidacion;
  actividades: string | null;
  turnos: TurnoValidacion[];
  minutosAcreditables: number;
};

export type EnlaceValidacion = {
  supervisor: { nombre: string };
  expiraEn: string;
  semanas: SemanaValidacion[];
};

export type Decision =
  | { semanaId: string; accion: 'VALIDAR' }
  | { semanaId: string; accion: 'RECHAZAR'; comentario: string };

export type ResultadoDecision = { semanaId: string; resultado: 'VALIDADA' | 'RECHAZADA' | 'YA_RESUELTA' };

export const validacionKeys = {
  enlace: (token: string) => ['validacion', token] as const,
};

export function useEnlaceValidacion(token: string) {
  return useQuery({
    queryKey: validacionKeys.enlace(token),
    queryFn: () => apiFetch<{ enlace: EnlaceValidacion }>(`/api/validacion/${encodeURIComponent(token)}`),
    select: (data) => data.enlace,
    retry: false,
  });
}

// Resolving asks for the link again so the page shows the states the server has now.
export function useResolverSemanas(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decisiones: Decision[]) =>
      apiFetch<{ resultados: ResultadoDecision[] }>(`/api/validacion/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: JSON.stringify({ decisiones }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: validacionKeys.enlace(token) }),
  });
}
