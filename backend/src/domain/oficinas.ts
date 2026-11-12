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

// Names of the two offices (specs §4), used in messages that tell the student where to go.
export const NOMBRE_OFICINA: Readonly<Record<TipoPrograma, string>> = {
  PRACTICAS: 'Oficina de Prácticas Profesionales',
  SERVICIO_SOCIAL: 'Oficina de Servicio Social y Titulación',
};

// When the program is unknown (activation, deactivated account), both offices are named.
export const AMBAS_OFICINAS_DESTINO = 'la Oficina de Prácticas Profesionales o a la de Servicio Social y Titulación';

export function puedeAdministrarTipo(usuario: UsuarioConOficina, tipo: TipoPrograma): boolean {
  return alcanceOficina(usuario).includes(tipo);
}
