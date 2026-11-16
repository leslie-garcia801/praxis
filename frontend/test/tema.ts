import { vi } from 'vitest';

// Test helpers for the theme (RNF-09): a controllable matchMedia and a clean <html> between tests.
export function mockSistemaOscuro(inicial: boolean) {
  let matches = inicial;
  const listeners = new Set<() => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal('matchMedia', () => mql);
  return {
    cambiar(valor: boolean) {
      matches = valor;
      listeners.forEach((fn) => fn());
    },
    oyentes: () => listeners.size,
  };
}

export function limpiarDocumentoTema() {
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  document.head.querySelector('meta[name="theme-color"]')?.remove();
}

export function agregarMetaThemeColor(color = '#1e3a8a') {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = color;
  document.head.append(meta);
  return meta;
}
