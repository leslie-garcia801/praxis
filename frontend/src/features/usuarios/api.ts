import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// Contract of POST /api/usuarios (backend/src/modules/usuarios). ADMIN only.

export type Oficina = 'PRACTICAS' | 'SERVICIO_SOCIAL';

export type CrearUsuarioInput = { nombre: string; email: string; oficina: Oficina | null };

export type UsuarioCreado = {
  usuario: { id: string; nombre: string; email: string | null; rol: string; oficina: Oficina | null };
  passwordTemporal: string;
};

export function crearUsuarioVinculacion(input: CrearUsuarioInput) {
  return apiFetch<UsuarioCreado>('/api/usuarios', { method: 'POST', body: JSON.stringify(input) });
}

// Contracts of GET/PATCH /api/usuarios and POST /api/usuarios/:id/restablecer-contrasena (task 0056). ADMIN only.

export type UsuarioOficina = {
  id: string;
  nombre: string;
  email: string;
  rol: 'VINCULACION' | 'ADMIN';
  // null: both offices for VINCULACION; always null for ADMIN.
  oficina: Oficina | null;
  activo: boolean;
  debeCambiar: boolean;
  creadoEn: string;
};

export type EditarUsuarioBody = { nombre?: string; oficina?: Oficina | null; activo?: boolean };

export const usuariosKeys = { lista: ['usuarios'] as const };

export function useUsuarios() {
  return useQuery({
    queryKey: usuariosKeys.lista,
    queryFn: () => apiFetch<{ usuarios: UsuarioOficina[] }>('/api/usuarios').then((r) => r.usuarios),
  });
}

// Replaces the row with the server's answer instead of refetching: the list keeps its order while the admin works.
export function useEditarUsuario(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EditarUsuarioBody) =>
      apiFetch<{ usuario: UsuarioOficina }>(`/api/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: ({ usuario }) =>
      queryClient.setQueryData<UsuarioOficina[]>(usuariosKeys.lista, (lista) =>
        lista?.map((u) => (u.id === usuario.id ? usuario : u)),
      ),
  });
}

// gcTime 0: the temporary password must not linger in the mutation cache (RF-04).
export function useRestablecerContrasenaUsuario(id: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ passwordTemporal: string }>(`/api/usuarios/${id}/restablecer-contrasena`, { method: 'POST' }),
    gcTime: 0,
  });
}
