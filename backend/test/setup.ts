// Global test setup.
// Table cleanup between tests is added once route tests start using the database
// (see backend/CLAUDE.md, "Pruebas").
process.env.NODE_ENV = 'test';
