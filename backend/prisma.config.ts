import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Load .env for local CLI usage; Railway injects variables directly.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Run by `prisma migrate reset` and `prisma db seed`; needs SEED_ADMIN_* variables.
    seed: 'tsx src/scripts/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
