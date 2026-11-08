import { describe, expect, it } from 'vitest';
import { generarPasswordTemporal } from './passwordTemporal.js';

describe('generarPasswordTemporal', () => {
  it('RF-04: has 10 characters without look-alike symbols (0/O, 1/l/I)', () => {
    for (let i = 0; i < 200; i++) {
      const password = generarPasswordTemporal();
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{10}$/);
    }
  });

  it('is random', () => {
    const generadas = new Set(Array.from({ length: 500 }, generarPasswordTemporal));

    expect(generadas.size).toBe(500);
  });
});
