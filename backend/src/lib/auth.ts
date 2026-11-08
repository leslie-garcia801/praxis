import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { username } from 'better-auth/plugins';
import { env } from '../config/env.js';
import { hashPassword, verifyPassword } from './password.js';
import { prisma } from './prisma.js';

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

// Sign-in attempts allowed per client IP and route within the window (RNF-06).
// Students may share one school NAT IP, so the limit is per minute rather than long lockouts.
const SIGN_IN_RULE = { window: 60, max: 10 };

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  basePath: '/api/auth',
  trustedOrigins: [env.FRONTEND_ORIGIN],
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    // No open registration: accounts are created by import/activation (RF-02) or by an admin.
    disableSignUp: true,
    password: { hash: hashPassword, verify: verifyPassword },
  },

  // Students sign in with their control number; vinculación staff with their email (RF-03).
  plugins: [username()],

  // Built-in routes this app must not expose.
  disabledPaths: [
    '/sign-up/email', // no open registration (RF-02)
    '/change-password', // replaced by POST /api/me/cambiar-contrasena, which clears debeCambiar (RF-04)
    '/request-password-reset', // resets go through vinculación (RF-04); there is no email reset
    '/reset-password',
    '/update-user', // names come from Edumedia; users cannot edit their profile here
    '/change-email',
    '/delete-user',
    '/delete-user/callback',
    '/update-session',
    '/is-username-available', // would reveal which control numbers exist
    '/link-social',
    '/unlink-account',
  ],

  user: {
    additionalFields: {
      // Server-managed fields: input: false prevents clients from setting them.
      plantelId: { type: 'string', required: true, input: false },
      rol: { type: 'string', required: false, defaultValue: 'ALUMNO', input: false },
      oficina: { type: 'string', required: false, input: false },
      debeCambiar: { type: 'boolean', required: false, defaultValue: false, input: false },
      activo: { type: 'boolean', required: false, defaultValue: true, input: false },
    },
  },

  databaseHooks: {
    session: {
      create: {
        // Runs after the password check: a deactivated account gets no session. Only someone who
        // knows the password learns the account is deactivated. requireSession also rejects
        // sessions of accounts deactivated later.
        before: async (session) => {
          const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { activo: true } });
          if (!user?.activo) {
            throw new APIError('FORBIDDEN', {
              code: 'CUENTA_INACTIVA',
              message: 'Tu cuenta está desactivada. Acude a vinculación.',
            });
          }
        },
      },
    },
  },

  // httpOnly session cookie lasting 30 days (RF-03).
  session: {
    expiresIn: THIRTY_DAYS_IN_SECONDS,
    updateAge: 60 * 60 * 24,
  },

  rateLimit: {
    enabled: true,
    customRules: {
      '/sign-in/username': SIGN_IN_RULE,
      '/sign-in/email': SIGN_IN_RULE,
    },
  },

  advanced: {
    useSecureCookies: env.NODE_ENV === 'production',
    // Better Auth skips the origin check when NODE_ENV=test; keep it on so tests match production.
    disableOriginCheck: false,
  },
});

export type Session = typeof auth.$Infer.Session;
