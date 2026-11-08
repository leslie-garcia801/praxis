import { z } from 'zod';

// Initial admin credentials come from the environment, never from source code.
const seedEnvSchema = z.object({
  SEED_ADMIN_EMAIL: z.email(),
  SEED_ADMIN_PASSWORD: z.string().min(12),
  SEED_ADMIN_NOMBRE: z.string().trim().min(1).default('Administrador'),
});

export type SeedAdmin = { email: string; password: string; nombre: string };

export function parseSeedEnv(source: NodeJS.ProcessEnv): SeedAdmin {
  const result = seedEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid seed variables:\n${issues.join('\n')}`);
  }
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NOMBRE } = result.data;
  return { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD, nombre: SEED_ADMIN_NOMBRE };
}
