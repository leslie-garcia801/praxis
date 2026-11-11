import { fechaLocal, instanteLocal, sumarDias } from '../lib/tiempo.js';

export type TurnoParaHorario = {
  entrada: Date;
  // null while the shift is still open.
  salida: Date | null;
  // ISO weekdays, 1 = Monday … 7 = Sunday. Empty means no agreed days.
  diasPactados: number[];
  // "HH:mm" in America/Monterrey. Both null means no agreed hours.
  horaEntrada: string | null;
  horaSalida: string | null;
};

// ISO weekday (1 = Monday … 7 = Sunday) of a local calendar date.
function diaIso(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

// RN-06b: true when a shift deserves the supervisor's attention. Only a shift that falls on a day that was not agreed,
// or that never overlaps the agreed hours at all, is flagged: arriving early or leaving late is normal as long as the
// shift overlaps the window (decision 2026-11-11). The day and the hours are those of America/Monterrey (RN-15).
//
// A shift that crosses midnight is judged against the window of its entry day. An open shift is judged by its entry
// alone (the entry must fall inside the window). With no agreed days only the hours are checked, and the other way
// round; with neither the shift is never flagged. A window whose end is not after its start ends the next day.
export function turnoFueraDeHorario({ entrada, salida, diasPactados, horaEntrada, horaSalida }: TurnoParaHorario): boolean {
  const dia = fechaLocal(entrada);
  if (diasPactados.length > 0 && !diasPactados.includes(diaIso(dia))) return true;
  if (horaEntrada === null || horaSalida === null) return false;

  const inicio = instanteLocal(dia, horaEntrada);
  const fin = instanteLocal(horaSalida > horaEntrada ? dia : sumarDias(dia, 1), horaSalida);

  if (salida === null) return entrada < inicio || entrada > fin;
  return !(entrada < fin && salida > inicio);
}
