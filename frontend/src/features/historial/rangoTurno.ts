import { diaMonterrey, formatDiaCorto, formatHora } from '@/lib/tiempo';
import type { Turno } from './api';

// "10:11 – 16:18"; the exit carries its day when it is not the day of the entry (crosses midnight).
export function textoRango(turno: Pick<Turno, 'entrada' | 'salida' | 'estado'>): string {
  const entrada = formatHora(turno.entrada);
  if (turno.estado === 'ABIERTA') return `${entrada} – en curso`;
  // RN-08: the automatic 23:59 close is not a real exit.
  if (!turno.salida || turno.estado === 'INCOMPLETA') return `${entrada} – Sin salida registrada`;
  const salida = formatHora(turno.salida);
  const otroDia = diaMonterrey(turno.salida) !== diaMonterrey(turno.entrada);
  return `${entrada} – ${otroDia ? `${salida} (${formatDiaCorto(diaMonterrey(turno.salida))})` : salida}`;
}
