import type { EstadoValidacion } from '../../generated/prisma/enums.js';
import { prisma } from '../../lib/prisma.js';
import { fechaLocal, sumarDias } from '../../lib/tiempo.js';
import { bitacoraValida, ESTADOS_QUE_ENVIAN, semanaCerrada } from '../semanas/semanas.service.js';
import { enviarEnlaceValidacion } from './validacion.service.js';

// A supervisor who already got a link in this window is skipped, so a retried run does not email twice.
export const VENTANA_PROTECCION_MS = 12 * 3_600_000;

type Enviar = (supervisorId: string, semanaIds: string[], ahora: () => Date) => Promise<unknown>;

export type ResumenSemanal = {
  // Closed weeks moved to ENVIADA by step 1.
  enviadasAutomaticamente: number;
  // Supervisors emailed, with the number of weeks in their link.
  notificados: { supervisorId: string; semanas: number }[];
  // Supervisors skipped because they got a link in the last 12 hours.
  omitidos: string[];
  // Supervisors whose email failed; the run continues with the next one.
  fallidos: { supervisorId: string; error: string }[];
  // ENVIADA weeks whose case file has no supervisor (ids), nobody to email.
  sinSupervisor: string[];
};

// RF-20, RF-21, RF-21a, RF-22, RN-17, RF-29: Monday job. Step 1 sends closed weeks the student left unsent but with a
// valid logbook; step 2 emails each supervisor one link with every pending (ENVIADA) week. `ahora` and `enviar` are
// injectable for tests; `forzar` ignores the double-run protection (development only).
export async function ejecutarResumenSemanal({
  ahora,
  forzar = false,
  enviar = enviarEnlaceValidacion,
}: {
  ahora: Date;
  forzar?: boolean;
  enviar?: Enviar;
}): Promise<ResumenSemanal> {
  const enviadasAutomaticamente = await enviarSemanasCerradas(ahora);

  const pendientes = await prisma.semanaBitacora.findMany({
    where: { estado: 'ENVIADA', expediente: { estado: { not: 'CANCELADO' } } },
    select: { id: true, expediente: { select: { supervisorId: true } } },
    orderBy: { id: 'asc' },
  });
  const porSupervisor = new Map<string, string[]>();
  const sinSupervisor: string[] = [];
  for (const { id, expediente } of pendientes) {
    if (!expediente.supervisorId) {
      sinSupervisor.push(id);
      continue;
    }
    porSupervisor.set(expediente.supervisorId, [...(porSupervisor.get(expediente.supervisorId) ?? []), id]);
  }

  const notificados: ResumenSemanal['notificados'] = [];
  const omitidos: string[] = [];
  const fallidos: ResumenSemanal['fallidos'] = [];
  for (const [supervisorId, semanaIds] of porSupervisor) {
    if (!forzar) {
      const reciente = await prisma.enlaceValidacion.findFirst({
        where: { supervisorId, creadoEn: { gt: new Date(ahora.getTime() - VENTANA_PROTECCION_MS) } },
        select: { id: true },
      });
      if (reciente) {
        omitidos.push(supervisorId);
        continue;
      }
    }
    try {
      await enviar(supervisorId, semanaIds, () => ahora);
      notificados.push({ supervisorId, semanas: semanaIds.length });
    } catch (error) {
      fallidos.push({ supervisorId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { enviadasAutomaticamente, notificados, omitidos, fallidos, sinSupervisor };
}

// Step 1. Each week is its own transaction; the state is part of the update condition so a concurrent change by the
// student wins. A rejected week goes only if the logbook was edited after the rejection (RF-22); one rejected
// before `rechazadaEn` existed (null) is left to the student.
async function enviarSemanasCerradas(ahora: Date): Promise<number> {
  // A week is closed when its Sunday passed (RN-15): its Monday is before today minus 6 days.
  const limite = new Date(`${sumarDias(fechaLocal(ahora), -6)}T00:00:00.000Z`);
  const candidatas = await prisma.semanaBitacora.findMany({
    where: {
      estado: { in: ['BORRADOR', 'RECHAZADA'] },
      semanaInicio: { lt: limite },
      expediente: { estado: { in: [...ESTADOS_QUE_ENVIAN] } },
    },
  });

  let enviadas = 0;
  for (const semana of candidatas) {
    if (!semanaCerrada(semana.semanaInicio, ahora) || !bitacoraValida(semana.actividades)) continue;
    if (semana.estado === 'RECHAZADA') {
      const corregida = semana.rechazadaEn && semana.bitacoraActualizadaEn && semana.bitacoraActualizadaEn > semana.rechazadaEn;
      if (!corregida) continue;
    }
    const anterior: EstadoValidacion = semana.estado;
    const enviada = await prisma.$transaction(async (tx) => {
      const { count } = await tx.semanaBitacora.updateMany({
        where: { id: semana.id, estado: anterior },
        data: { estado: 'ENVIADA', enviadaEn: ahora },
      });
      if (count === 0) return false;
      await tx.auditLog.create({
        data: {
          usuarioId: null,
          accion: 'ENVIAR_SEMANA_AUTOMATICO',
          entidad: 'SemanaBitacora',
          entidadId: semana.id,
          antes: { estado: anterior },
          despues: { estado: 'ENVIADA', enviadaEn: ahora.toISOString() },
        },
      });
      return true;
    });
    if (enviada) enviadas++;
  }
  return enviadas;
}
