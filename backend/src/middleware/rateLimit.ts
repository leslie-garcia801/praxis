import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

type RateLimitOptions = { windowMs: number; max: number };

const SWEEP_THRESHOLD = 10_000;

// Fixed-window, in-memory limit per client IP for public routes Better Auth does not cover (RNF-06).
// Single-instance only: move to a shared store if the API runs on several instances.
export function rateLimit({ windowMs, max }: RateLimitOptions): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > SWEEP_THRESHOLD) {
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    }

    const key = req.ip ?? 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      throw new AppError(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Espera un minuto e intenta de nuevo.');
    }
    next();
  };
}
