import { describe, expect, it } from 'vitest';
import { parseQr } from './parseQr';

const TOKEN = 'k3Jx9_aB-0123456789abcdefghijklmnopqrstuvwxy';

describe('parseQr (RF-13, RF-14)', () => {
  it('extracts the token from a valid QR URL', () => {
    expect(parseQr(`https://praxis.example.com/s/${TOKEN}`)).toEqual({ ok: true, token: TOKEN });
  });

  it('accepts a trailing slash', () => {
    expect(parseQr(`https://praxis.example.com/s/${TOKEN}/`)).toEqual({ ok: true, token: TOKEN });
  });

  it('rejects text that is not a URL', () => {
    expect(parseQr('hola mundo')).toEqual({ ok: false, message: 'Este código QR no es de Praxis' });
  });

  it('rejects a URL from another site without the /s/ path', () => {
    expect(parseQr('https://example.com/otra/ruta')).toEqual({ ok: false, message: 'Este código QR no es de Praxis' });
  });

  it('rejects a URL without token', () => {
    expect(parseQr('https://praxis.example.com/s/')).toEqual({ ok: false, message: 'Este código QR no es de Praxis' });
  });
});
