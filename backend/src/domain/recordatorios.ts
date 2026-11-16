// Reminder rules (RF-28). Pure functions: no Express, no Prisma.
import { fechaLocal } from '../lib/tiempo.js';

const MS_POR_MINUTO = 60_000;

/** RF-28: an open shift older than this is probably a forgotten clock-out (6 h). */
export const MINUTOS_RECORDAR_SALIDA = 6 * 60;

/**
 * Whether an open shift that started at `entrada` needs the "forgot to clock out" reminder at `ahora`: 6 h or more
 * have passed AND it is still the same local day (America/Monterrey). By RN-08 the next scan after midnight closes the
 * shift as INCOMPLETA and opens a new entry, so the student can no longer clock out of it (and this avoids night pushes).
 */
export const necesitaRecordatorioSalida = (entrada: Date, ahora: Date): boolean =>
  ahora.getTime() - entrada.getTime() >= MINUTOS_RECORDAR_SALIDA * MS_POR_MINUTO && fechaLocal(entrada) === fechaLocal(ahora);
