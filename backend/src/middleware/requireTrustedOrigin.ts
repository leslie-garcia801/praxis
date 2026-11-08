import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Rejects state-changing requests sent by a browser from an untrusted origin (CSRF).
// Needed because Better Auth's username plugin does not run its own origin check on
// sign-in when the request carries no cookie.
export function requireTrustedOrigin(trustedOrigins: string[]): RequestHandler {
  const trusted = new Set(trustedOrigins.map((o) => new URL(o).origin));

  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = requestOrigin(req.get('origin') ?? req.get('referer'));
    if (origin === undefined || trusted.has(origin)) return next();

    next(new AppError(403, 'ORIGEN_NO_PERMITIDO', 'La petición proviene de un origen no permitido.'));
  };
}

function requestOrigin(header: string | undefined): string | undefined {
  if (!header) return undefined;
  try {
    return new URL(header).origin;
  } catch {
    return 'null';
  }
}
