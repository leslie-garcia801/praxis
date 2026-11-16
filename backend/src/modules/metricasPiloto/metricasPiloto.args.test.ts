import { describe, expect, it } from 'vitest';
import { MENSAJE_USO, parsearArgumentos } from './metricasPiloto.args.js';

describe('Piloto §12: argumentos del reporte de métricas', () => {
  it('Piloto §12: acepta solo --desde y --hasta', () => {
    expect(parsearArgumentos(['--desde', '2026-11-16', '--hasta', '2026-12-20'])).toEqual({
      ok: true,
      valor: { desde: '2026-11-16', hasta: '2026-12-20' },
    });
  });

  it('Piloto §12: acepta todos los filtros y la salida CSV', () => {
    const r = parsearArgumentos([
      '--desde', '2026-11-16', '--hasta', '2026-12-20', '--carrera', 'Programación', '--semestre', '5',
      '--grupo', 'A', '--tipo', 'PRACTICAS', '--csv', 'salida.csv', '--plantel', 'abc',
    ]);
    expect(r).toEqual({
      ok: true,
      valor: {
        desde: '2026-11-16', hasta: '2026-12-20', carrera: 'Programación', semestre: 5, grupo: 'A',
        tipo: 'PRACTICAS', csv: 'salida.csv', plantel: 'abc',
      },
    });
  });

  it('Piloto §12: ignora el "--" que pnpm antepone a los argumentos', () => {
    const r = parsearArgumentos(['--', '--desde', '2026-11-16', '--hasta', '2026-11-16']);
    expect(r.ok).toBe(true);
  });

  it('Piloto §12: acepta --csv - para imprimir el CSV por la salida estándar', () => {
    const r = parsearArgumentos(['--desde', '2026-11-16', '--hasta', '2026-11-20', '--csv', '-']);
    expect(r).toMatchObject({ ok: true, valor: { csv: '-' } });
  });

  it('Piloto §12: falta --desde', () => {
    const r = parsearArgumentos(['--hasta', '2026-12-20']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.mensaje).toContain('--desde');
      expect(r.mensaje).toContain(MENSAJE_USO);
    }
  });

  it('Piloto §12: falta --hasta', () => {
    const r = parsearArgumentos(['--desde', '2026-11-16']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain('--hasta');
  });

  it('Piloto §12: --hasta antes de --desde es un error', () => {
    const r = parsearArgumentos(['--desde', '2026-12-20', '--hasta', '2026-11-16']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toMatch(/--hasta.*anterior/);
  });

  it('Piloto §12: --desde igual a --hasta es válido (rango inclusivo de un día)', () => {
    expect(parsearArgumentos(['--desde', '2026-11-16', '--hasta', '2026-11-16']).ok).toBe(true);
  });

  it('Piloto §12: fecha con formato inválido o inexistente', () => {
    expect(parsearArgumentos(['--desde', '16/11/2026', '--hasta', '2026-12-20']).ok).toBe(false);
    expect(parsearArgumentos(['--desde', '2026-02-30', '--hasta', '2026-12-20']).ok).toBe(false);
  });

  it('Piloto §12: --tipo inválido', () => {
    const r = parsearArgumentos(['--desde', '2026-11-16', '--hasta', '2026-12-20', '--tipo', 'BECA']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain('--tipo');
  });

  it('Piloto §12: --semestre debe ser un entero', () => {
    expect(parsearArgumentos(['--desde', '2026-11-16', '--hasta', '2026-12-20', '--semestre', 'cinco']).ok).toBe(false);
    expect(parsearArgumentos(['--desde', '2026-11-16', '--hasta', '2026-12-20', '--semestre', '5.5']).ok).toBe(false);
  });

  it('Piloto §12: opción desconocida', () => {
    const r = parsearArgumentos(['--desde', '2026-11-16', '--hasta', '2026-12-20', '--foo', 'x']);
    expect(r.ok).toBe(false);
  });

  it('Piloto §12: opción sin valor', () => {
    expect(parsearArgumentos(['--desde', '2026-11-16', '--hasta']).ok).toBe(false);
  });
});
