import { describe, expect, it } from 'vitest';
import { alcanceOficina, puedeAdministrarTipo } from './oficinas.js';

describe('RN-03b: alcance por oficina', () => {
  it('RN-03b: vinculación de Prácticas solo administra expedientes de prácticas', () => {
    const usuario = { rol: 'VINCULACION', oficina: 'PRACTICAS' } as const;

    expect(puedeAdministrarTipo(usuario, 'PRACTICAS')).toBe(true);
    expect(puedeAdministrarTipo(usuario, 'SERVICIO_SOCIAL')).toBe(false);
    expect(alcanceOficina(usuario)).toEqual(['PRACTICAS']);
  });

  it('RN-03b: vinculación de Servicio Social solo administra expedientes de servicio social', () => {
    const usuario = { rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' } as const;

    expect(puedeAdministrarTipo(usuario, 'SERVICIO_SOCIAL')).toBe(true);
    expect(puedeAdministrarTipo(usuario, 'PRACTICAS')).toBe(false);
    expect(alcanceOficina(usuario)).toEqual(['SERVICIO_SOCIAL']);
  });

  it('RN-03b: vinculación sin oficina asignada administra ambas', () => {
    const usuario = { rol: 'VINCULACION', oficina: null } as const;

    expect(puedeAdministrarTipo(usuario, 'PRACTICAS')).toBe(true);
    expect(puedeAdministrarTipo(usuario, 'SERVICIO_SOCIAL')).toBe(true);
    expect(alcanceOficina(usuario)).toEqual(['SERVICIO_SOCIAL', 'PRACTICAS']);
  });

  it('RN-03b: el administrador ve ambas oficinas aunque tenga oficina asignada', () => {
    const usuario = { rol: 'ADMIN', oficina: 'PRACTICAS' } as const;

    expect(puedeAdministrarTipo(usuario, 'SERVICIO_SOCIAL')).toBe(true);
    expect(alcanceOficina(usuario)).toEqual(['SERVICIO_SOCIAL', 'PRACTICAS']);
  });

  it('un alumno no administra expedientes de ninguna oficina', () => {
    const usuario = { rol: 'ALUMNO', oficina: null } as const;

    expect(puedeAdministrarTipo(usuario, 'PRACTICAS')).toBe(false);
    expect(alcanceOficina(usuario)).toEqual([]);
  });
});
