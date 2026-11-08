import { parseEnv } from './env.schema.js';

export type { Env } from './env.schema.js';

// Validated once at startup; the process fails fast on invalid configuration.
export const env = parseEnv(process.env);
