// Every-15-minutes job (RF-28): push reminder to students whose shift has been open for 6 hours or more. Run by a
// Railway cron (see task 0046). Usage: pnpm job:recordatorio-salida   (production: node dist/scripts/recordatorioSalida.js)
import { prisma } from '../lib/prisma.js';
import { ejecutarRecordatorioSalida } from '../modules/recordatorios/recordatorios.service.js';

try {
  const resumen = await ejecutarRecordatorioSalida({ ahora: new Date() });
  console.log('Recordatorio de salida');
  if (resumen.pushApagado) console.log('  Push apagado (sin claves VAPID en producción): no se envió ni se marcó nada.');
  console.log(`  Turnos recordados: ${resumen.recordados}`);
  console.log(`  Notificaciones enviadas: ${resumen.enviadas}`);
  console.log(`  Suscripciones eliminadas: ${resumen.eliminadas}`);
  console.log(`  Errores: ${resumen.errores.length}`);
  for (const e of resumen.errores) console.log(`    - ${e.endpoint}: ${e.mensaje}`);
  if (resumen.errores.length > 0) process.exitCode = 1;
} catch (error) {
  console.error('El recordatorio de salida falló:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
