import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    // Public origin of the frontend (Vercel); the only trusted origin for auth requests.
    FRONTEND_ORIGIN: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    // Public URL the browser uses to reach the API (through the Vercel rewrite, RNF-05).
    BETTER_AUTH_URL: z.url(),
    // RF-21: required in production (Resend). In development an empty key prints emails to the console.
    RESEND_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    APP_TIMEZONE: z.literal('America/Monterrey').default('America/Monterrey'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const clave of ['RESEND_API_KEY', 'MAIL_FROM'] as const) {
      if (!env[clave]) ctx.addIssue({ code: 'custom', path: [clave], message: 'Es obligatoria en producción.' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${issues.join('\n')}`);
  }
  return result.data;
}
