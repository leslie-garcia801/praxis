import { describe, expect, it } from 'vitest';
import { nombresCoinciden, normalizarNombre } from './nombres.js';

describe('normalizarNombre', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(normalizarNombre('  JOSÉ   María ')).toBe('jose maria');
  });

  it('treats ñ and n the same', () => {
    expect(normalizarNombre('Peña')).toBe(normalizarNombre('PENA'));
  });

  it('ignores dieresis', () => {
    expect(normalizarNombre('Agüero')).toBe('aguero');
  });
});

describe('nombresCoinciden', () => {
  it('RF-02: matches the typed name and first surname against the record', () => {
    const registro = { nombre: 'Ana María', apellidoPaterno: 'López' };

    expect(nombresCoinciden(registro, { nombre: 'ana maria', apellidoPaterno: 'LOPEZ' })).toBe(true);
  });

  it('RF-02: rejects a different first name or surname', () => {
    const registro = { nombre: 'Ana María', apellidoPaterno: 'López' };

    expect(nombresCoinciden(registro, { nombre: 'Ana', apellidoPaterno: 'López' })).toBe(false);
    expect(nombresCoinciden(registro, { nombre: 'Ana María', apellidoPaterno: 'Lopes' })).toBe(false);
  });
});
