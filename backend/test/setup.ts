// Global test setup: runs once per test file, before its tests.
import { beforeAll } from 'vitest';

process.env.NODE_ENV = 'test';

// Non-secret defaults so tests run without filling these in .env.test.
process.env.BETTER_AUTH_SECRET ??= 'test-secret-not-for-production-0123456789';
process.env.BETTER_AUTH_URL ??= 'http://localhost:5173';
process.env.FRONTEND_ORIGIN ??= 'http://localhost:5173';

// Each test file starts from an empty app_test, even if a previous file crashed halfway.
// Files run one at a time (fileParallelism: false). Within a file, tests share the data they create,
// so build it with test/factories.ts. Imported lazily so the env defaults above apply first.
beforeAll(async () => {
  const { limpiarBase } = await import('./db.js');
  await limpiarBase();
});
