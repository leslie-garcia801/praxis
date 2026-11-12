import { z } from 'zod';
import { urlQr } from '../domain/qrPdf.js';
import { prisma } from '../lib/prisma.js';
import { DEMO_VINCULACION, seedDemo } from './seedDemoData.js';

// Entry point: `pnpm db:seed:demo`. Local development only; refuses to run in production.
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('The demo seed never runs in production.');

  const env = z
    .object({ SEED_DEMO_PASSWORD: z.string().min(12), FRONTEND_ORIGIN: z.url().default('http://localhost:5173') })
    .safeParse(process.env);
  if (!env.success) throw new Error('Set SEED_DEMO_PASSWORD (12+ characters) in backend/.env to run the demo seed.');

  const result = await seedDemo(prisma, { password: env.data.SEED_DEMO_PASSWORD });
  if (!result.creado) {
    console.log('Demo data already exists; nothing changed.');
    return;
  }

  console.log('Vinculación users (password: SEED_DEMO_PASSWORD):');
  for (const v of DEMO_VINCULACION) console.log(`  ${v.email}  (${v.oficina})`);
  console.log('Students (sign in with the control number):');
  for (const a of result.alumnos) {
    console.log(`  ${a.matricula}  ${a.nombre}  ${a.conCuenta ? '' : '[no account] '}— ${a.descripcion}`);
  }
  console.log('Institutions (the QR link is shown only now; regenerate it from the app if lost):');
  for (const i of result.instituciones) {
    console.log(`  ${i.nombre}  short code ${i.codigoCorto}  ${urlQr(env.data.FRONTEND_ORIGIN, i.token)}`);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
