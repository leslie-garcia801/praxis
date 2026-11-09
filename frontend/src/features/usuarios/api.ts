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
