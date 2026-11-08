import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Builds the Express app without listening, so tests can import it.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Requests arrive through the Vercel rewrite proxy (RNF-05).
  app.set('trust proxy', 1);

  // Better Auth's handler must be mounted on /api/auth/* BEFORE express.json() (iteration 1).

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
