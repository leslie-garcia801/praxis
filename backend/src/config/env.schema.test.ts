import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.schema.js';

describe('parseEnv', () => {
  const base = { DATABASE_URL: 'postgresql://app:app@localhost:5432/app_dev' };

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
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });
});
