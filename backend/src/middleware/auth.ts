import { fromNodeHeaders } from 'better-auth/node';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { AMBAS_OFICINAS_DESTINO, puedeAdministrarTipo, type Rol, type TipoPrograma } from '../domain/oficinas.js';
import { auth } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';

const ROLES = ['ALUMNO', 'VINCULACION', 'ADMIN'] as const;
const TIPOS = ['SERVICIO_SOCIAL', 'PRACTICAS'] as const;

// Narrows Better Auth's loosely typed additional fields to the domain types.
const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  username: z.string().nullish().transform((v) => v ?? null),
  plantelId: z.string(),
  rol: z.enum(ROLES),
  oficina: z.enum(TIPOS).nullish().transform((v) => v ?? null),
  debeCambiar: z.boolean(),
  activo: z.boolean(),
});

export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthContext = { user: AuthUser; sessionId: string };

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

// Returns the session set by requireSession; throws 401 if the route forgot to mount it.
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}

type RequireSessionOptions = {
  // Lets a user whose temporary password is still pending reach this route (RF-04).
  permitirCambioPendiente?: boolean;
};

// 401 without a valid session; 403 for deactivated accounts or a pending password change.
export function requireSession({ permitirCambioPendiente = false }: RequireSessionOptions = {}): RequestHandler {
  return async (req, _res, next) => {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!result) throw AppError.unauthorized();

    const user = authUserSchema.parse(result.user);
    if (!user.activo) {
      throw new AppError(403, 'CUENTA_INACTIVA', `Tu cuenta está desactivada. Acude a ${AMBAS_OFICINAS_DESTINO}.`);
    }
    if (user.debeCambiar && !permitirCambioPendiente) {
      throw new AppError(403, 'DEBE_CAMBIAR_CONTRASENA', 'Debes cambiar tu contraseña temporal para continuar.');
    }

    req.auth = { user, sessionId: result.session.id };
    next();
  };
}

// 403 unless the signed-in user has one of the given roles. Mount after requireSession.
export function requireRol(...roles: Rol[]): RequestHandler {
  return (req, _res, next) => {
    const { user } = getAuth(req);
    if (!roles.includes(user.rol)) throw AppError.forbidden();
    next();
  };
}

// RN-03b: resolves the program type of the requested resource and checks the user's office.
// The resolver returns null when the resource does not exist (404).
export function requireOficina(resolverTipo: (req: Request) => Promise<TipoPrograma | null>): RequestHandler {
  return async (req, _res, next) => {
    const { user } = getAuth(req);
    const tipo = await resolverTipo(req);
    if (tipo === null) throw AppError.notFound();
    if (!puedeAdministrarTipo(user, tipo)) throw AppError.forbidden();
    next();
  };
}
