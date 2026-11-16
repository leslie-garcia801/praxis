import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Oficina } from '@/lib/oficinas';

// Contract of GET/PUT /api/oficinas/responsables (task 0049, backend/src/modules/oficinas).
// GET always returns two entries (SERVICIO_SOCIAL, PRACTICAS); name and position are null until captured.

export type Responsable = {
  oficina: Oficina;
  nombreOficina: string;
  nombre: string | null;
  cargo: string | null;
  actualizadoEn: string | null;
};

export type GuardarResponsableInput = { nombre: string; cargo: string };

export const responsablesKey = ['oficinas', 'responsables'] as const;

export function useResponsables() {
  return useQuery({
    queryKey: responsablesKey,
    queryFn: () => apiFetch<Responsable[]>('/api/oficinas/responsables'),
  });
}

// Saves one office and swaps only its entry in the cached list, so the other form is untouched.
export function useGuardarResponsable(oficina: Oficina) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GuardarResponsableInput) =>
      apiFetch<Responsable>(`/api/oficinas/responsables/${oficina}`, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (guardado) =>
      queryClient.setQueryData<Responsable[]>(responsablesKey, (lista) =>
        lista?.map((r) => (r.oficina === guardado.oficina ? guardado : r)),
      ),
  });
}
