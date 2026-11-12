import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { TipoPrograma, Turno } from '../instituciones/api';

// Contract of GET /api/panel/alumnos (backend/src/modules/panel, task 0026).

export type Riesgo = 'EN_RIESGO' | 'EN_TIEMPO' | 'SIN_DATOS' | 'NO_EVALUABLE' | 'COMPLETADO';

export type FilaPanel = {
  expediente: {
    id: string;
    tipo: TipoPrograma;
    estado: string;
    fechaInicio: string | null;
    fechaTermino: string | null;
  };
  alumno: {
    id: string;
    nombre: string;
    matricula: string | null;
    carrera: string;
    semestre: number;
    grupo: string;
    turno: Turno;
  };
  institucion: { id: string; nombre: string } | null;
  minutosValidados: number;
  metaMinutos: number;
  porcentaje: number;
  // Registered but not yet validated.
  minutosRegistrados: number;
  // UTC instant; shown in America/Monterrey (RN-15).
  ultimoRegistro: string | null;
  // Weeks waiting for the supervisor.
  semanasPendientes: number;
  // Calendar dates 'YYYY-MM-DD'.
  fechaEstimada: string | null;
  limite: string | null;
  riesgo: Riesgo;
};

export type AlertaExpedientes = { total: number; expedienteIds: string[] };

export type SupervisorSinConfirmar = {
  id: string;
  nombre: string;
  institucion: { id: string; nombre: string };
  expedienteIds: string[];
};

// Always computed over the whole office: the filters do not affect them.
export type Alertas = {
  sinRegistros: AlertaExpedientes;
  semanasSinValidar: AlertaExpedientes;
  turnosIncompletos: AlertaExpedientes;
  supervisoresSinConfirmar: { total: number; supervisores: SupervisorSinConfirmar[] };
};

export type RespuestaPanel = { alumnos: FilaPanel[]; alertas: Alertas };

// Query parameters sent to the API. A missing key means "no filter".
export const CLAVES_FILTRO = ['estado', 'carreraId', 'semestre', 'grupo', 'turno', 'institucionId', 'tipo', 'riesgo'] as const;
export type ClaveFiltro = (typeof CLAVES_FILTRO)[number];
export type FiltrosPanel = Partial<Record<ClaveFiltro, string>>;

export const panelKeys = {
  all: ['panel'] as const,
  alumnos: (filtros: FiltrosPanel) => [...panelKeys.all, 'alumnos', filtros] as const,
};

function toQueryString(filtros: FiltrosPanel): string {
  const params = new URLSearchParams();
  for (const clave of CLAVES_FILTRO) {
    const valor = filtros[clave];
    if (valor !== undefined && valor !== '') params.set(clave, valor);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function usePanelAlumnos(filtros: FiltrosPanel) {
  return useQuery({
    queryKey: panelKeys.alumnos(filtros),
    queryFn: () => apiFetch<RespuestaPanel>(`/api/panel/alumnos${toQueryString(filtros)}`),
    placeholderData: keepPreviousData,
  });
}
