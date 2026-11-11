// Dev helper (RF-21): sends a validation link to a supervisor with all the weeks of their students that are waiting
// for validation (ENVIADA). In development without RESEND_API_KEY the email is printed to the console.
// Usage: pnpm dev:enlace <supervisorId>
import { prisma } from '../lib/prisma.js';
import { enviarEnlaceValidacion } from '../modules/validacion/validacion.service.js';

const supervisorId = process.argv[2];
if (!supervisorId) {
  console.error('Uso: pnpm dev:enlace <supervisorId>');
  process.exit(1);
}

try {
  const semanas = await prisma.semanaBitacora.findMany({
    where: { estado: 'ENVIADA', expediente: { supervisorId } },
    select: { id: true },
  });
  if (semanas.length === 0) throw new Error('Ese supervisor no tiene semanas enviadas pendientes de validar.');
  const enlaceId = await enviarEnlaceValidacion(supervisorId, semanas.map((s) => s.id));
  console.log(`Enlace ${enlaceId} creado con ${semanas.length} semana(s).`);
} finally {
  await prisma.$disconnect();
}
