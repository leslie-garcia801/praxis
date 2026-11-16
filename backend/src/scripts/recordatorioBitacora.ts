// Sunday job (RF-28): push reminder to write the logbook of the current week. Run by a Railway cron (see task 0046).
// Usage: pnpm job:recordatorio-bitacora [--forzar]   (production: node dist/scripts/recordatorioBitacora.js)
// --forzar ignores the double-run protection; use it only in development.
import { prisma } from '../lib/prisma.js';
import { ejecutarRecordatorioBitacora } from '../modules/recordatorios/recordatorios.service.js';

const forzar = process.argv.includes('--forzar');

try {
  const resumen = await ejecutarRecordatorioBitacora({ ahora: new Date(), forzar });
  console.log('Recordatorio de bitácora');
  if (resumen.pushApagado) console.log('  Push apagado (sin claves VAPID en producción): no se envió ni se marcó nada.');
  console.log(`  Semanas recordadas: ${resumen.recordadas}`);
  console.log(`  Notificaciones enviadas: ${resumen.enviadas}`);
  console.log(`  Suscripciones eliminadas: ${resumen.eliminadas}`);
  console.log(`  Errores: ${resumen.errores.length}`);
  for (const e of resumen.errores) console.log(`    - ${e.endpoint}: ${e.mensaje}`);
  if (resumen.errores.length > 0) process.exitCode = 1;
} catch (error) {
  console.error('El recordatorio de bitácora falló:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
