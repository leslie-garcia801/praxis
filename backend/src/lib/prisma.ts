import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

// RN-15: the adapter sends timestamps without a time zone, so PostgreSQL reads them in the session zone. Forcing the
// session to UTC keeps stored instants correct on any server, whatever its default zone (see src/lib/prisma.test.ts).
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, options: '-c TimeZone=UTC' });

export const prisma = new PrismaClient({ adapter });
