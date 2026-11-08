import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Route tests run against a real PostgreSQL test database (app_test).
if (existsSync('.env.test')) process.loadEnvFile('.env.test');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // Tests share one database; run files sequentially to avoid cross-test interference.
    fileParallelism: false,
  },
});
