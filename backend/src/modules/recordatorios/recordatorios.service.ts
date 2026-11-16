import { MINUTOS_RECORDAR_SALIDA, necesitaRecordatorioSalida } from '../../domain/recordatorios.js';
import { prisma } from '../../lib/prisma.js';
import { enviarPush, pushApagado, type ResultadoPush } from '../../lib/push.js';
import { fechaHoraLocal, fechaLocal, inicioSemana, instanteLocal } from '../../lib/tiempo.js';
import { bitacoraValida, ESTADOS_EDITABLES } from '../semanas/semanas.service.js';

type Enviar = typeof enviarPush;

export type ResumenRecordatorios = {
  // Push is off (production without VAPID keys): nothing was sent and no row was marked.
  pushApagado: boolean;
  // Rows claimed (marked) by this run; each one is a reminder attempt.
  recordados: number;
  // Push notifications delivered (one per subscription).
  enviadas: number;
  // Subscriptions removed because the push service said they expired.
  eliminadas: number;
  errores: ResultadoPush['errores'];
};

const resumenVacio = (apagado: boolean): ResumenRecordatorios => ({ pushApagado: apagado, recordados: 0, enviadas: 0, eliminadas: 0, errores: [] });

function acumular(resumen: ResumenRecordatorios, resultado: ResultadoPush) {
  resumen.recordados++;
  resumen.enviadas += resultado.enviadas;
  resumen.eliminadas += resultado.eliminadas;
  resumen.errores.push(...resultado.errores);
}

// RF-28: "forgot to clock out" reminder, run every 15 minutes. Reminds open shifts of EN_PROCESO case files that
// started 6 h or more ago on the same local day (RN-08: after midnight the shift can no longer be closed). Each shift is claimed with a conditional UPDATE
// (`recordatorio_enviado_en IS NULL`), so overlapping runs send at most once; the claim is kept even when the student
// has no subscriptions (the in-app notice shows through `turnoAbierto.recordarSalida`). With push off nothing is
// claimed, so reminders start working once keys are configured. `ahora`, `enviar` and `apagado` are injectable.
export async function ejecutarRecordatorioSalida({
  ahora,
  enviar = enviarPush,
  apagado = pushApagado,
}: {
  ahora: Date;
  enviar?: Enviar;
  apagado?: () => boolean;
}): Promise<ResumenRecordatorios> {
  if (apagado()) return resumenVacio(true);

  const resumen = resumenVacio(false);
  const candidatos = await prisma.asistencia.findMany({
    where: {
      estado: 'ABIERTA',
      recordatorioEnviadoEn: null,
      entrada: {
        lte: new Date(ahora.getTime() - MINUTOS_RECORDAR_SALIDA * 60_000),
        // Bound for the query only; eligibility is decided by the domain function (same local day).
        gte: instanteLocal(fechaLocal(ahora), '00:00'),
      },
      expediente: { estado: 'EN_PROCESO' },
    },
    select: { id: true, entrada: true, expediente: { select: { alumno: { select: { usuarioId: true } } } } },
    orderBy: { entrada: 'asc' },
  });

  for (const { id, entrada, expediente } of candidatos) {
    if (!necesitaRecordatorioSalida(entrada, ahora)) continue;
    const { count } = await prisma.asistencia.updateMany({
      where: { id, estado: 'ABIERTA', recordatorioEnviadoEn: null },
      data: { recordatorioEnviadoEn: ahora },
    });
    if (count === 0) continue;
    acumular(
      resumen,
      await enviar(expediente.alumno.usuarioId, {
        titulo: '¿Olvidaste registrar tu salida?',
        cuerpo: `Tu turno sigue abierto desde las ${fechaHoraLocal(entrada).slice(11)}.`,
        url: '/alumno/registrar',
      }),
    );
  }
  return resumen;
}

export type ResumenRecordatorioBitacora = Omit<ResumenRecordatorios, 'recordados'> & { recordadas: number };

// RF-28, RF-18, RN-15, RN-17: Sunday 18:00 reminder. For the current week (Monday to Sunday in Monterrey) of each
// EN_PROCESO case file with attendance that week, still editable and without a valid logbook, one push per week.
// Double-run protection: the week row has `recordatorio_bitacora_en`, set with a conditional UPDATE before sending
// (`IS NULL`), so retries and overlapping runs send once; `forzar` ignores the mark (development only). The week
// row is the right place because it already exists per case file and week. With push off nothing is marked.
export async function ejecutarRecordatorioBitacora({
  ahora,
  forzar = false,
  enviar = enviarPush,
  apagado = pushApagado,
}: {
  ahora: Date;
  forzar?: boolean;
  enviar?: Enviar;
  apagado?: () => boolean;
}): Promise<ResumenRecordatorioBitacora> {
  const { recordados, ...resto } = resumenVacio(apagado());
  const resumen = { ...resto, recordadas: recordados };
  if (resumen.pushApagado) return resumen;

  const lunes = inicioSemana(fechaLocal(ahora));
  const semanas = await prisma.semanaBitacora.findMany({
    where: {
      semanaInicio: new Date(`${lunes}T00:00:00.000Z`),
      estado: { in: [...ESTADOS_EDITABLES] },
      expediente: { estado: 'EN_PROCESO' },
      asistencias: { some: {} },
      ...(forzar ? {} : { recordatorioBitacoraEn: null }),
    },
    select: { id: true, actividades: true, expediente: { select: { alumno: { select: { usuarioId: true } } } } },
    orderBy: { id: 'asc' },
  });

  for (const semana of semanas) {
    if (bitacoraValida(semana.actividades)) continue;
    const { count } = await prisma.semanaBitacora.updateMany({
      where: { id: semana.id, estado: { in: [...ESTADOS_EDITABLES] }, ...(forzar ? {} : { recordatorioBitacoraEn: null }) },
      data: { recordatorioBitacoraEn: ahora },
    });
    if (count === 0) continue;
    const resultado = await enviar(semana.expediente.alumno.usuarioId, {
      titulo: 'Escribe tu bitácora de la semana',
      cuerpo: 'Escribe lo que hiciste esta semana para enviarla a tu supervisor.',
      url: `/alumno/historial?semana=${lunes}`,
    });
    resumen.recordadas++;
    resumen.enviadas += resultado.enviadas;
    resumen.eliminadas += resultado.eliminadas;
    resumen.errores.push(...resultado.errores);
  }
  return resumen;
}
