// Theme preference (RNF-09): "claro" | "oscuro" | "sistema", remembered on the device.
// Keep the key, the values and the colors in sync with the inline script in index.html,
// which applies the saved theme before the first paint to avoid a flash.

export type PreferenciaTema = 'claro' | 'oscuro' | 'sistema';
export type TemaResuelto = 'claro' | 'oscuro';

export const CLAVE_TEMA = 'praxis.tema';
export const PREFERENCIAS_TEMA: readonly PreferenciaTema[] = ['claro', 'oscuro', 'sistema'];
// Light: the PWA manifest color. Dark: the `.dark` --background (oklch(0.145 0 0)).
export const COLOR_TEMA: Record<TemaResuelto, string> = { claro: '#1e3a8a', oscuro: '#0a0a0a' };

const CONSULTA_OSCURO = '(prefers-color-scheme: dark)';

export function esPreferenciaTema(valor: unknown): valor is PreferenciaTema {
  return PREFERENCIAS_TEMA.includes(valor as PreferenciaTema);
}

// Storage can throw (private mode, blocked site data): never let it break the theme.
export function leerPreferencia(): PreferenciaTema {
  try {
    const guardada = localStorage.getItem(CLAVE_TEMA);
    return esPreferenciaTema(guardada) ? guardada : 'sistema';
  } catch {
    return 'sistema';
  }
}

function guardarPreferencia(preferencia: PreferenciaTema) {
  try {
    localStorage.setItem(CLAVE_TEMA, preferencia);
  } catch {
    // The choice still applies for this session.
  }
}

function consultaOscuro(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(CONSULTA_OSCURO) : null;
}

export function resolverTema(preferencia: PreferenciaTema): TemaResuelto {
  if (preferencia === 'sistema') return consultaOscuro()?.matches ? 'oscuro' : 'claro';
  return preferencia;
}

function aplicarTema(tema: TemaResuelto) {
  const raiz = document.documentElement;
  raiz.classList.toggle('dark', tema === 'oscuro');
  raiz.style.colorScheme = tema === 'oscuro' ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_TEMA[tema]);
}

// In-memory state, so the choice survives for the session even when storage is unavailable.
let preferenciaActual: PreferenciaTema | null = null;
const oyentes = new Set<() => void>();

export function obtenerPreferencia(): PreferenciaTema {
  preferenciaActual ??= leerPreferencia();
  return preferenciaActual;
}

export function establecerPreferencia(preferencia: PreferenciaTema) {
  preferenciaActual = preferencia;
  guardarPreferencia(preferencia);
  aplicarTema(resolverTema(preferencia));
  oyentes.forEach((avisar) => avisar());
}

export function suscribirPreferencia(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

// Applies the theme and follows system changes while the preference is "sistema".
// Call once at startup; returns a function that stops listening.
export function iniciarTema(): () => void {
  aplicarTema(resolverTema(obtenerPreferencia()));
  const consulta = consultaOscuro();
  if (!consulta) return () => {};
  const alCambiar = () => {
    if (obtenerPreferencia() === 'sistema') aplicarTema(resolverTema('sistema'));
  };
  consulta.addEventListener('change', alCambiar);
  return () => consulta.removeEventListener('change', alCambiar);
}

// For tests: forget the in-memory preference so the next read goes to storage again.
export function reiniciarTema() {
  preferenciaActual = null;
  oyentes.clear();
}
