import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw/server';

// jsdom's fetch needs absolute URLs; resolve relative /api paths against a fake origin.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) =>
  originalFetch(typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input, init);

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
