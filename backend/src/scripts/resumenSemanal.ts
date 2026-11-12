// Monday job (RF-21a): sends each supervisor one email with every week waiting for validation. Run by a Railway cron
// (see task 0022). Usage: pnpm job:resumen-semanal [--forzar]   (production: node dist/scripts/resumenSemanal.js)
// --forzar ignores the 12-hour double-run protection; use it only in development.
import { prisma } from '../lib/prisma.js';
import { ejecutarResumenSemanal } from '../modules/validacion/resumenSemanal.service.js';

const forzar = process.argv.includes('--forzar');

try {
  const resumen = await ejecutarResumenSemanal({ ahora: new Date(), forzar });
  console.log('Resumen semanal');
  console.log(`  Semanas enviadas automáticamente: ${resumen.enviadasAutomaticamente}`);
  console.log(`  Supervisores notificados: ${resumen.notificados.length}`);
  for (const n of resumen.notificados) console.log(`    - ${n.supervisorId}: ${n.semanas} semana(s)`);
  console.log(`  Supervisores omitidos (enlace en las últimas 12 horas): ${resumen.omitidos.length}`);
  for (const id of resumen.omitidos) console.log(`    - ${id}`);
  console.log(`  Envíos fallidos: ${resumen.fallidos.length}`);
  for (const f of resumen.fallidos) console.log(`    - ${f.supervisorId}: ${f.error}`);
  console.log(`  Semanas sin supervisor: ${resumen.sinSupervisor.length}`);
  for (const id of resumen.sinSupervisor) console.log(`    - ${id}`);
  if (resumen.fallidos.length > 0) process.exitCode = 1;
} catch (error) {
  console.error('El resumen semanal falló:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
