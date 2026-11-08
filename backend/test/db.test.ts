import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { assertTestDatabase, limpiarBase } from './db.js';

describe('assertTestDatabase', () => {
  it('accepts a database whose name ends in _test', () => {
    expect(() => assertTestDatabase('postgresql://app:app@localhost:5432/app_test')).not.toThrow();
    expect(() => assertTestDatabase('postgresql://app:app@localhost:5432/app_test?schema=public')).not.toThrow();
  });

  it.each([
    'postgresql://app:app@localhost:5432/app_dev',
    'postgresql://app:app@db.railway.internal:5432/railway',
    'postgresql://app:app@localhost:5432/app_test_backup',
  ])('refuses to wipe %s', (url) => {
    expect(() => assertTestDatabase(url)).toThrow(/_test/);
  });
});

describe('limpiarBase', () => {
  it('empties every table except the migrations history', async () => {
    await prisma.plantel.create({ data: { nombre: 'Plantel para limpiar' } });

    await limpiarBase();

    expect(await prisma.plantel.count()).toBe(0);
    const filas = await prisma.$queryRaw<{ migraciones: bigint }[]>`
      SELECT count(*) AS migraciones FROM "_prisma_migrations"`;
    expect(Number(filas[0]?.migraciones)).toBeGreaterThan(0);
  });
});
