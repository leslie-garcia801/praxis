import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import { env } from './config/env.js';
import { auth } from './lib/auth.js';
import { requireTrustedOrigin } from './middleware/requireTrustedOrigin.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Builds the Express app without listening, so tests can import it.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Requests arrive through the Vercel rewrite proxy (RNF-05).
  app.set('trust proxy', 1);

  // Better Auth parses its own body, so it is mounted BEFORE express.json().
  app.all('/api/auth/*splat', requireTrustedOrigin([env.FRONTEND_ORIGIN]), toNodeHandler(auth));

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
