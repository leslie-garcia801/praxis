import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Load .env for local CLI usage; Railway injects variables directly.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
