import { prisma } from '../lib/prisma.js';
import { seedBase } from './seedBase.js';
import { parseSeedEnv } from './seedEnv.js';

// Entry point: `pnpm db:seed` (dev) or `node dist/scripts/seed.js` (Railway).
async function main() {
  const admin = parseSeedEnv(process.env);
  const result = await seedBase(prisma, { admin });

  console.log(`Plantel: ${result.plantelCreado ? 'creado' : 'ya existía'}`);
  console.log(`Carreras nuevas: ${result.carrerasCreadas}`);
  console.log(`Administrador ${admin.email}: ${result.adminCreado ? 'creado' : 'ya existía (sin cambios)'}`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
