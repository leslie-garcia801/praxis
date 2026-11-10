import { describe, expect, it } from 'vitest';
import { ALFABETO_CODIGO_CORTO, generarCodigoCorto, generarCredencialesQr, hashTokenQr } from './qrInstitucion.js';

describe('qrInstitucion', () => {
  it('RF-15: the short code has 6 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const codigo = generarCodigoCorto();
      expect(codigo).toHaveLength(6);
      for (const c of codigo) expect(ALFABETO_CODIGO_CORTO).toContain(c);
    }
  });

  it('RF-15: the alphabet has no look-alike characters', () => {
    expect(ALFABETO_CODIGO_CORTO).not.toMatch(/[01OIlLo]/);
  });

  it('RNF-06: the QR token is random and only its SHA-256 hash is derived from it', () => {
    const a = generarCredencialesQr();
    const b = generarCredencialesQr();

    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43); // 32 bytes in base64url
    expect(a.qrTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.qrTokenHash).toBe(hashTokenQr(a.token));
    expect(a.qrTokenHash).not.toContain(a.token);
  });

  it('RF-13: the token is URL-safe', () => {
    expect(generarCredencialesQr().token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('RF-15: the credentials include a short code', () => {
    expect(generarCredencialesQr().codigoCorto).toHaveLength(6);
  });
});
