import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('RNF-06: hashes passwords with argon2id', async () => {
    const hash = await hashPassword('Secreta123');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('Secreta123');
  });

  it('RNF-06: verifies the correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('Secreta123');

    await expect(verifyPassword({ hash, password: 'Secreta123' })).resolves.toBe(true);
    await expect(verifyPassword({ hash, password: 'otra-clave' })).resolves.toBe(false);
  });

  it('returns false instead of throwing for a malformed hash', async () => {
    await expect(verifyPassword({ hash: 'no-es-un-hash', password: 'x' })).resolves.toBe(false);
  });
});
