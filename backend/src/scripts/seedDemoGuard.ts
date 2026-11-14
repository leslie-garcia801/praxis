const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// The demo seed creates office accounts that share one known password, so it only runs against a local
// database. NODE_ENV alone is not enough: it can be unset in a deployed environment.
export function assertDemoSeedAllowed(env: { NODE_ENV?: string; DATABASE_URL?: string }): void {
  if (env.NODE_ENV === 'production') throw new Error('The demo seed never runs in production.');

  let host = '';
  try {
    host = new URL(env.DATABASE_URL ?? '').hostname;
  } catch {
    // Missing or malformed URL: treated as not local.
  }
  if (!LOCAL_HOSTS.has(host)) throw new Error('The demo seed only runs against a local database (localhost or 127.0.0.1).');
}
