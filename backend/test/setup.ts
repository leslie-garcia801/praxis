// Global test setup.
// Table cleanup between tests is added once route tests start using the database
// (see backend/CLAUDE.md, "Pruebas").
process.env.NODE_ENV = 'test';

// Non-secret defaults so tests run without filling these in .env.test.
process.env.BETTER_AUTH_SECRET ??= 'test-secret-not-for-production-0123456789';
process.env.BETTER_AUTH_URL ??= 'http://localhost:5173';
process.env.FRONTEND_ORIGIN ??= 'http://localhost:5173';
