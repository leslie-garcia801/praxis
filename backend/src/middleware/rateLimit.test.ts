import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from './errorHandler.js';
import { rateLimit } from './rateLimit.js';

function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.post('/x', rateLimit({ windowMs: 60_000, max: 2 }), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('rateLimit', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 429 with the standard error shape after the limit', async () => {
    const app = buildApp();
    const hit = () => request(app).post('/x').set('X-Forwarded-For', '10.9.0.1');

    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(200);
    const res = await hit();

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('DEMASIADOS_INTENTOS');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('counts each client IP separately', async () => {
    const app = buildApp();
    await request(app).post('/x').set('X-Forwarded-For', '10.9.0.2');
    await request(app).post('/x').set('X-Forwarded-For', '10.9.0.2');

    const res = await request(app).post('/x').set('X-Forwarded-For', '10.9.0.3');

    expect(res.status).toBe(200);
  });

  it('allows requests again after the window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-09T15:00:00Z'));
    const app = buildApp();
    const hit = () => request(app).post('/x').set('X-Forwarded-For', '10.9.0.4');
    await hit();
    await hit();
    expect((await hit()).status).toBe(429);

    vi.setSystemTime(new Date('2026-11-09T15:01:01Z'));

    expect((await hit()).status).toBe(200);
  });
});
