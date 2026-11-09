import { usernameClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Better Auth client. Same-origin on purpose (RNF-05): /api/auth goes through the Vite proxy in
// development and the Vercel rewrite in production, never straight to Railway.
export const authClient = createAuthClient({
  baseURL: typeof window === 'undefined' ? undefined : window.location.origin,
  plugins: [usernameClient()],
  // Resolve fetch on every call instead of capturing it at import time, so test doubles
  // (MSW patches globalThis.fetch after modules load) always apply.
  fetchOptions: { customFetchImpl: (input, init) => globalThis.fetch(input, init) },
});
