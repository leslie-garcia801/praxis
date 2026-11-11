import { useMutation, useQueryClient } from '@tanstack/react-query';
import { avanceKeys } from '@/features/avance/api';
import { meKey } from '@/features/auth/api';
import { apiFetch } from '@/lib/api';

// Contract of POST /api/asistencias/escaneo (backend task 0014). The server decides entry or exit
// and computes every minute; the frontend only shows the result.

export type Credencial = { token: string } | { codigoCorto: string };

export type EscaneoRequest = { id: string } & Credencial;

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

export function useRegistrarEscaneo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: EscaneoRequest) =>
      apiFetch<EscaneoResponse>('/api/asistencias/escaneo', {
        method: 'POST',
        // The body is a strict object on the server: only these fields.
        body: JSON.stringify({ ...request, sinConexion: false }),
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: meKey }),
        queryClient.invalidateQueries({ queryKey: avanceKeys.all }),
      ]),
  });
}
