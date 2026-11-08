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
});
