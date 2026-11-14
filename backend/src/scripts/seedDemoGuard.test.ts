import { describe, expect, it } from 'vitest';
import { assertDemoSeedAllowed } from './seedDemoGuard.js';

const LOCAL = 'postgresql://app:app@localhost:5432/app_dev';

describe('assertDemoSeedAllowed', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('allows a local database (%s)', (host) => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'development', DATABASE_URL: `postgresql://u:p@${host}:5432/app` })).not.toThrow();
  });

  it('allows a local database when NODE_ENV is not set', () => {
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: LOCAL })).not.toThrow();
  });

  it('refuses to run in production, even against a local database', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production', DATABASE_URL: LOCAL })).toThrow(/never runs in production/);
  });

  it('refuses a remote database even when NODE_ENV is not set', () => {
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: 'postgresql://u:p@db.up.railway.app:5432/railway' })).toThrow(/local database/);
  });

  it('refuses when DATABASE_URL is missing or invalid', () => {
    expect(() => assertDemoSeedAllowed({})).toThrow(/local database/);
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: 'not a url' })).toThrow(/local database/);
  });

  it('does not leak credentials in the error message', () => {
    let message = '';
    try {
      assertDemoSeedAllowed({ DATABASE_URL: 'postgresql://user:secret@db.up.railway.app:5432/x' });
    } catch (e) {
      message = e instanceof Error ? e.message : '';
    }
    expect(message).not.toBe('');
    expect(message).not.toMatch(/secret|railway/);
  });
});
