import { useMutation, useQueryClient } from '@tanstack/react-query';
import { avanceKeys } from '@/features/avance/api';
import { meKey } from '@/features/auth/api';
import { apiFetch } from '@/lib/api';

// Contract of POST /api/asistencias/escaneo (backend task 0014). The server decides entry or exit
// and computes every minute; the frontend only shows the result.

export type Credencial = { token: string } | { codigoCorto: string };

export type EscaneoRequest = { id: string } & Credencial & { hora?: string; sinConexion?: boolean };

export type EscaneoResponse = {
  tipo: 'ENTRADA' | 'SALIDA';
  asistencia: {
    id: string;
    entrada: string;
    salida: string | null;
    estado: string;
    minutosAcreditables: number;
    sinConexion: boolean;
  };
  minutosDia: number;
  minutosAcreditablesDia: number;
  excedente: number;
};

// Plain function shared by the hook and the offline queue sync (RF-16). Online scans send
// sinConexion: false unless the request says otherwise.
export function registrarEscaneo(request: EscaneoRequest): Promise<EscaneoResponse> {
  return apiFetch<EscaneoResponse>('/api/asistencias/escaneo', {
    method: 'POST',
    // The body is a strict object on the server: only these fields.
    body: JSON.stringify({ sinConexion: false, ...request }),
  });
}

export function useRegistrarEscaneo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: registrarEscaneo,
    // Never paused: offline the page queues the scan itself (RF-16).
    networkMode: 'always',
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: meKey }),
        queryClient.invalidateQueries({ queryKey: avanceKeys.all }),
      ]),
  });
}
