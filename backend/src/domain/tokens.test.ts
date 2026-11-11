import { describe, expect, it } from 'vitest';
import { generarToken, hashToken } from './tokens.js';
import { hashTokenQr } from './qrInstitucion.js';

describe('tokens', () => {
  it('RNF-06: the token has 32 random bytes in base64url', () => {
    const a = generarToken();
    const b = generarToken();

    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('RNF-06: only the SHA-256 hex hash is derived from the token', () => {
    const token = generarToken();

    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });

  it('RNF-06: the QR hash is the same function (stored hashes stay valid)', () => {
    expect(hashTokenQr('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
