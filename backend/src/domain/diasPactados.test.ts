import { describe, expect, it } from 'vitest';
import { formatearDiasPactados } from './diasPactados.js';

describe('formatearDiasPactados', () => {
  it('writes "Lunes a viernes" for Monday to Friday', () => {
    expect(formatearDiasPactados([1, 2, 3, 4, 5])).toBe('Lunes a viernes');
    expect(formatearDiasPactados([5, 3, 1, 2, 4])).toBe('Lunes a viernes');
  });

  it('writes "Todos los días" for the whole week', () => {
    expect(formatearDiasPactados([1, 2, 3, 4, 5, 6, 7])).toBe('Todos los días');
  });

  it('lists abbreviated days in week order otherwise', () => {
    expect(formatearDiasPactados([5, 1, 3])).toBe('Lun, Mié, Vie');
    expect(formatearDiasPactados([6, 7])).toBe('Sáb, Dom');
    expect(formatearDiasPactados([2])).toBe('Mar');
  });

  it('ignores duplicates and unknown days, and is empty without days', () => {
    expect(formatearDiasPactados([1, 1, 3, 9])).toBe('Lun, Mié');
    expect(formatearDiasPactados([])).toBe('');
  });
});
