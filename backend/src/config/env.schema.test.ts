import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.schema.js';

describe('parseEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://app:app@localhost:5432/app_dev',
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:5173',
    FRONTEND_ORIGIN: 'http://localhost:5173',
  };

  it('applies defaults', () => {
    const env = parseEnv(base);

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('RN-15: fixes the display timezone to America/Monterrey', () => {
    expect(parseEnv(base).APP_TIMEZONE).toBe('America/Monterrey');
    expect(() => parseEnv({ ...base, APP_TIMEZONE: 'UTC' })).toThrow(/APP_TIMEZONE/);
  });

  it('fails fast when DATABASE_URL is missing', () => {
    const source: Record<string, string> = { ...base };
    delete source.DATABASE_URL;

    expect(() => parseEnv(source)).toThrow(/DATABASE_URL/);
  });

  it.each(['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'FRONTEND_ORIGIN'] as const)(
    'fails fast when %s is missing',
    (key) => {
      const source: Record<string, string> = { ...base };
      delete source[key];

      expect(() => parseEnv(source)).toThrow(new RegExp(key));
    },
  );

  it('rejects a BETTER_AUTH_SECRET shorter than 32 characters', () => {
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: 'corto' })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('RF-21: in production RESEND_API_KEY and MAIL_FROM are required', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/RESEND_API_KEY/);
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', RESEND_API_KEY: 're_x' })).toThrow(/MAIL_FROM/);
    expect(
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        RESEND_API_KEY: 're_x',
        MAIL_FROM: 'a@b.invalid',
      }).MAIL_FROM,
    ).toBe('a@b.invalid');
  });

  describe('claves VAPID (RF-28)', () => {
    const vapid = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:vinculacion@praxis.invalid' };
    const produccion = { ...base, NODE_ENV: 'production', RESEND_API_KEY: 're_x', MAIL_FROM: 'a@b.invalid' };

    it('RF-28: son opcionales fuera de producción', () => {
      const env = parseEnv(base);
      expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
      expect(parseEnv({ ...base, ...vapid }).VAPID_SUBJECT).toBe('mailto:vinculacion@praxis.invalid');
    });

    it.each(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const)(
      'RF-28: si falta solo %s, falla nombrándola (todas o ninguna)',
      (clave) => {
        const source: Record<string, string> = { ...base, ...vapid };
        delete source[clave];
        expect(() => parseEnv(source)).toThrow(new RegExp(clave));
      },
    );

    it('RF-28: en producción son opcionales (sin ellas el push queda apagado y la API arranca)', () => {
      expect(parseEnv(produccion).VAPID_PUBLIC_KEY).toBeUndefined();
      expect(parseEnv({ ...produccion, ...vapid }).VAPID_PRIVATE_KEY).toBe('priv');
    });

    it('RF-28: en producción también van las tres o ninguna', () => {
      expect(() => parseEnv({ ...produccion, VAPID_PUBLIC_KEY: 'pub' })).toThrow(/VAPID_PRIVATE_KEY/);
    });

    it('RF-28: VAPID_SUBJECT debe ser mailto: o una URL https', () => {
      expect(parseEnv({ ...base, ...vapid, VAPID_SUBJECT: 'https://praxis.invalid' }).VAPID_SUBJECT).toBe('https://praxis.invalid');
      expect(() => parseEnv({ ...base, ...vapid, VAPID_SUBJECT: 'contacto' })).toThrow(/VAPID_SUBJECT/);
    });
  });

  it('RF-21: development and test do not require the mail variables', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'development' })).not.toThrow();
    expect(() => parseEnv({ ...base, NODE_ENV: 'test' })).not.toThrow();
  });
});
