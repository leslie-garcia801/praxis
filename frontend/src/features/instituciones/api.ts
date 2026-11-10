import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, downloadFile } from '@/lib/api';
import { sendFile } from '../importaciones/archivo';

// Contract of /api/instituciones, /api/carreras and /api/importaciones/instituciones (backend/src/modules).

export type Turno = 'MATUTINO' | 'VESPERTINO';
export type TipoPrograma = 'SERVICIO_SOCIAL' | 'PRACTICAS';

export type Carrera = { id: string; nombre: string };

export type Institucion = {
  id: string;
  nombre: string;
  rfc: string | null;
  giro: string | null;
  calle: string;
  numExterior: string | null;
  numInterior: string | null;
  colonia: string | null;
  codigoPostal: string | null;
  municipio: string;
  estado: string;
  esPlantel: boolean;
  telefono: string | null;
  correo: string | null;
  representante: string | null;
  horarioAtencion: string | null;
  turnos: Turno[];
  aceptaServicio: boolean;
  aceptaPracticas: boolean;
  cupo: number | null;
  activa: boolean;
  carreras: Carrera[];
  codigoCorto: string;
};

// Body of POST (full) and PATCH (partial) /api/instituciones.
export type InstitucionInput = Omit<Institucion, 'id' | 'carreras' | 'codigoCorto'> & { carreraIds: string[] };

export type Filtros = {
  q?: string;
  municipio?: string;
  carrera?: string;
  turno?: Turno;
  tipo?: TipoPrograma;
  conCupo?: boolean;
};

export const institucionesKeys = {
  all: ['instituciones'] as const,
  lista: (filtros: Filtros) => [...institucionesKeys.all, 'lista', filtros] as const,
  detalle: (id: string) => [...institucionesKeys.all, 'detalle', id] as const,
};

export const carrerasKey = ['carreras'] as const;

function toQueryString(filtros: Filtros): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filtros)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useInstituciones(filtros: Filtros) {
  return useQuery({
    queryKey: institucionesKeys.lista(filtros),
    queryFn: () => apiFetch<{ instituciones: Institucion[] }>(`/api/instituciones${toQueryString(filtros)}`),
    select: (data) => data.instituciones,
    placeholderData: keepPreviousData,
  });
}

export function useInstitucion(id: string | undefined) {
  return useQuery({
    queryKey: institucionesKeys.detalle(id ?? ''),
    queryFn: () => apiFetch<{ institucion: Institucion }>(`/api/instituciones/${id}`),
    select: (data) => data.institucion,
    enabled: id !== undefined,
  });
}

export function useCarreras() {
  return useQuery({
    queryKey: carrerasKey,
    queryFn: () => apiFetch<{ carreras: Carrera[] }>('/api/carreras'),
    select: (data) => data.carreras,
    staleTime: 5 * 60_000,
  });
}

export function useGuardarInstitucion(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InstitucionInput) =>
      id
        ? apiFetch<{ institucion: Institucion }>(`/api/instituciones/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
        : apiFetch<{ institucion: Institucion }>('/api/instituciones', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: institucionesKeys.all }),
  });
}

// RF-13: every call issues a new token and short code, so the cached lists must be refreshed.
export function useDescargarQr(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => downloadFile(`/api/instituciones/${id}/qr`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: institucionesKeys.all }),
  });
}

export type FilaReporteInstitucion = {
  fila: number;
  nombre: string;
  accion: 'CREAR' | 'OMITIR' | null;
  coincideCon: { id: string; nombre: string; por: 'RFC' | 'NOMBRE' } | null;
  errores: { campo: string; mensaje: string }[];
};

export type ReporteImportacionInstituciones = {
  resumen: { total: number; validas: number; conErrores: number; crear: number; omitir: number };
  filas: FilaReporteInstitucion[];
};

export type ResultadoImportacionInstituciones = { resumen: { creados: number; omitidos: number } };

export function previewInstituciones(file: File) {
  return sendFile<ReporteImportacionInstituciones>('/api/importaciones/instituciones/preview', file);
}

export function confirmarInstituciones(file: File) {
  return sendFile<ResultadoImportacionInstituciones>('/api/importaciones/instituciones/confirmar', file);
}
