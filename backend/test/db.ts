import { prisma } from '../src/lib/prisma.js';

// Guard: wiping tables is only ever allowed on a database whose name ends in `_test`.
export function assertTestDatabase(databaseUrl: string): void {
  const nombre = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!nombre.endsWith('_test')) {
    throw new Error(`Refusing to wipe "${nombre}": tests only clean databases whose name ends in _test.`);
  }
}

// Empties every table (keeping the migrations history) so each test file starts from a clean database.
export async function limpiarBase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL ?? '');

  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tablas.length === 0) return;

  const lista = tablas.map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}
