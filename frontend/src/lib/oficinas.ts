// RN-03b: names shown to office staff. "Vinculación" is an internal route name; on screen each office
// uses its own name (specs §4) and the admin is labeled as such, so nobody reads another office's title.

export type Oficina = 'SERVICIO_SOCIAL' | 'PRACTICAS';

type Perfil = { rol: string; oficina: Oficina | null };

export const NOMBRE_OFICINA: Record<Oficina, string> = {
  PRACTICAS: 'Oficina de Prácticas Profesionales',
  SERVICIO_SOCIAL: 'Oficina de Servicio Social y Titulación',
};

const NOMBRE_PANEL: Record<Oficina, string> = {
  PRACTICAS: 'Panel de Prácticas Profesionales',
  SERVICIO_SOCIAL: 'Panel de Servicio Social y Titulación',
};

export const AMBAS_OFICINAS = 'Ambas oficinas';

// Destination when the student's program is unknown; keep in sync with the backend messages.
export const AMBAS_OFICINAS_DESTINO = 'la Oficina de Prácticas Profesionales o a la de Servicio Social y Titulación';

// Student messages: they name the office of the student's program, or both when there is none yet.
export const ACUDE_A_TU_OFICINA =
  'Acude a la Oficina de Prácticas Profesionales o a la de Servicio Social y Titulación, según tu programa.';

export function acudeALaOficina(tipo: Oficina): string {
  return `Acude a la ${NOMBRE_OFICINA[tipo]}.`;
}

// Header label: the admin is "Administrador"; office staff see their office.
export function etiquetaPerfil({ rol, oficina }: Perfil): string {
  if (rol === 'ADMIN') return 'Administrador';
  return oficina ? NOMBRE_OFICINA[oficina] : AMBAS_OFICINAS;
}

// Panel title: one office sees its own panel; whoever sees both (admin included) sees the general one.
export function tituloPanel({ rol, oficina }: Perfil): string {
  if (rol === 'ADMIN' || !oficina) return 'Panel general';
  return NOMBRE_PANEL[oficina];
}
