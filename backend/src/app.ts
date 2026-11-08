import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import { env } from './config/env.js';
import { auth } from './lib/auth.js';
import { requireTrustedOrigin } from './middleware/requireTrustedOrigin.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { activacionRouter } from './modules/activacion/activacion.routes.js';
import { alumnosRouter } from './modules/alumnos/alumnos.routes.js';
import { meRouter } from './modules/me/me.routes.js';

// Builds the Express app without listening, so tests can import it.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Requests arrive through the Vercel rewrite proxy (RNF-05).
  app.set('trust proxy', 1);

  const trustedOrigin = requireTrustedOrigin([env.FRONTEND_ORIGIN]);
  const json = express.json({ limit: '1mb' });

  // Own public routes under /api/auth (specs §9) go before Better Auth's catch-all.
  app.use('/api/auth/activar', trustedOrigin, json, activacionRouter);

  // Better Auth parses its own body, so it is mounted BEFORE express.json().
  app.all('/api/auth/*splat', trustedOrigin, toNodeHandler(auth));

  app.use(json);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/me', meRouter);
  app.use('/api/alumnos', alumnosRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
