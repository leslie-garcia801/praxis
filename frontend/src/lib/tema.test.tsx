import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agregarMetaThemeColor, limpiarDocumentoTema, mockSistemaOscuro } from '../../test/tema';
import { CLAVE_TEMA, COLOR_TEMA, iniciarTema, leerPreferencia, reiniciarTema } from './tema';
import { useTema } from './useTema';

const esOscuro = () => document.documentElement.classList.contains('dark');
let detener: (() => void) | undefined;

beforeEach(() => {
  reiniciarTema();
  limpiarDocumentoTema();
});
afterEach(() => {
  detener?.();
  detener = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  limpiarDocumentoTema();
});

describe('Tema (RNF-09)', () => {
  it('RNF-09: sin preferencia guardada sigue al sistema (oscuro)', () => {
    mockSistemaOscuro(true);
    detener = iniciarTema();
    expect(leerPreferencia()).toBe('sistema');
    expect(esOscuro()).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('RNF-09: sin preferencia guardada sigue al sistema (claro)', () => {
    mockSistemaOscuro(false);
    detener = iniciarTema();
    expect(esOscuro()).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('RNF-09: elegir Oscuro agrega la clase y se recuerda', () => {
    mockSistemaOscuro(false);
    detener = iniciarTema();
    const { result } = renderHook(() => useTema());
    act(() => result.current.setPreferencia('oscuro'));
    expect(result.current.preferencia).toBe('oscuro');
    expect(esOscuro()).toBe(true);
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('oscuro');
  });

  it('RNF-09: elegir Claro quita la clase aunque el sistema sea oscuro y se recuerda', () => {
    mockSistemaOscuro(true);
    detener = iniciarTema();
    const { result } = renderHook(() => useTema());
    act(() => result.current.setPreferencia('claro'));
    expect(esOscuro()).toBe(false);
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('claro');
  });

  it('RNF-09: usa la preferencia guardada al iniciar', () => {
    mockSistemaOscuro(false);
    localStorage.setItem(CLAVE_TEMA, 'oscuro');
    detener = iniciarTema();
    expect(esOscuro()).toBe(true);
  });

  it('RNF-09: en Sistema reacciona en vivo a un cambio del sistema', () => {
    const sistema = mockSistemaOscuro(false);
    detener = iniciarTema();
    expect(esOscuro()).toBe(false);
    act(() => sistema.cambiar(true));
    expect(esOscuro()).toBe(true);
    act(() => sistema.cambiar(false));
    expect(esOscuro()).toBe(false);
  });

  it('RNF-09: con Claro u Oscuro ignora los cambios del sistema', () => {
    const sistema = mockSistemaOscuro(false);
    localStorage.setItem(CLAVE_TEMA, 'claro');
    detener = iniciarTema();
    act(() => sistema.cambiar(true));
    expect(esOscuro()).toBe(false);
  });

  it('RNF-09: un valor guardado inválido equivale a Sistema', () => {
    mockSistemaOscuro(true);
    localStorage.setItem(CLAVE_TEMA, 'morado');
    detener = iniciarTema();
    expect(leerPreferencia()).toBe('sistema');
    expect(esOscuro()).toBe(true);
  });

  it('RNF-09: si localStorage falla, el tema sigue funcionando durante la sesión', () => {
    mockSistemaOscuro(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    detener = iniciarTema();
    const { result } = renderHook(() => useTema());
    expect(result.current.preferencia).toBe('sistema');
    act(() => result.current.setPreferencia('oscuro'));
    expect(result.current.preferencia).toBe('oscuro');
    expect(esOscuro()).toBe(true);
  });

  it('RNF-09: sin matchMedia (navegador antiguo) usa tema claro', () => {
    vi.stubGlobal('matchMedia', undefined);
    detener = iniciarTema();
    expect(esOscuro()).toBe(false);
  });

  it('RNF-09: actualiza el meta theme-color según el tema resuelto', () => {
    const meta = agregarMetaThemeColor();
    mockSistemaOscuro(false);
    detener = iniciarTema();
    expect(meta.content).toBe(COLOR_TEMA.claro);
    const { result } = renderHook(() => useTema());
    act(() => result.current.setPreferencia('oscuro'));
    expect(meta.content).toBe(COLOR_TEMA.oscuro);
    act(() => result.current.setPreferencia('claro'));
    expect(meta.content).toBe(COLOR_TEMA.claro);
  });

  it('RNF-09: al detener se quita el oyente del sistema', () => {
    const sistema = mockSistemaOscuro(false);
    const parar = iniciarTema();
    expect(sistema.oyentes()).toBe(1);
    parar();
    expect(sistema.oyentes()).toBe(0);
  });
});
