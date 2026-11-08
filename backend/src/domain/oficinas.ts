// RN-03b: each vinculación user manages only the case files of their office;
// the administrator (and a vinculación user without an office) sees both.
// Pure logic: no Express or Prisma.

export type Rol = 'ALUMNO' | 'VINCULACION' | 'ADMIN';
export type TipoPrograma = 'SERVICIO_SOCIAL' | 'PRACTICAS';

export const TIPOS_PROGRAMA: readonly TipoPrograma[] = ['SERVICIO_SOCIAL', 'PRACTICAS'];

export type UsuarioConOficina = { rol: Rol; oficina: TipoPrograma | null };

// Program types whose case files the user may manage; use it to filter list queries.
export function alcanceOficina(usuario: UsuarioConOficina): TipoPrograma[] {
  if (usuario.rol === 'ADMIN') return [...TIPOS_PROGRAMA];
  if (usuario.rol === 'VINCULACION') return usuario.oficina ? [usuario.oficina] : [...TIPOS_PROGRAMA];
  return [];
}

export function puedeAdministrarTipo(usuario: UsuarioConOficina, tipo: TipoPrograma): boolean {
  return alcanceOficina(usuario).includes(tipo);
}
