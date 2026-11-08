import { describe, expect, it } from 'vitest';
import { parseSeedEnv } from './seedEnv.js';

describe('parseSeedEnv', () => {
  const base = { SEED_ADMIN_EMAIL: 'admin@cbtis258.edu.mx', SEED_ADMIN_PASSWORD: 'Clave-Inicial-2026' };

  it('reads the admin credentials and defaults the display name', () => {
    expect(parseSeedEnv(base)).toEqual({
      email: 'admin@cbtis258.edu.mx',
      password: 'Clave-Inicial-2026',
      nombre: 'Administrador',
    });
  });

  it.each(['SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD'] as const)('fails when %s is missing', (key) => {
    const source: Record<string, string> = { ...base };
    delete source[key];

    expect(() => parseSeedEnv(source)).toThrow(new RegExp(key));
  });

  it('rejects an initial admin password shorter than 12 characters', () => {
    expect(() => parseSeedEnv({ ...base, SEED_ADMIN_PASSWORD: 'corta' })).toThrow(/SEED_ADMIN_PASSWORD/);
  });
});
