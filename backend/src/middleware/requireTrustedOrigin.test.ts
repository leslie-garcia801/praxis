import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './errorHandler.js';
import { requireTrustedOrigin } from './requireTrustedOrigin.js';

const TRUSTED = 'https://praxis.example';

function buildApp() {
  const app = express();
  app.use(requireTrustedOrigin([TRUSTED]));
  app.all('/x', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('requireTrustedOrigin', () => {
  const app = buildApp();

  it('allows a write from the trusted origin', async () => {
    const res = await request(app).post('/x').set('Origin', TRUSTED);

    expect(res.status).toBe(200);
  });

  it('RNF-05: rejects a write from another origin with the standard error shape', async () => {
    const res = await request(app).post('/x').set('Origin', 'https://malicioso.example');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORIGEN_NO_PERMITIDO');
  });

  it('falls back to the Referer origin when Origin is missing', async () => {
    const res = await request(app).post('/x').set('Referer', 'https://malicioso.example/login');

    expect(res.status).toBe(403);
  });

  it('allows writes without Origin or Referer (non-browser clients cannot perform CSRF)', async () => {
    const res = await request(app).post('/x');

    expect(res.status).toBe(200);
  });

  it('does not check safe methods', async () => {
    const res = await request(app).get('/x').set('Origin', 'https://malicioso.example');

    expect(res.status).toBe(200);
  });
});
