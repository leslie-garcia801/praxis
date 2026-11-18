import { z } from 'zod';
import { formatRangoSemana, lunesDeSemana } from '@/lib/tiempo';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MAX_TURNOS_LIBRETA = 200;

export type TurnoLibretaValues = { turnoId: string; fecha: string; entrada: string; salida: string };
export type LibretaValues = { turnos: TurnoLibretaValues[] };

type Opciones = {
  // Today in Monterrey ('YYYY-MM-DD'): only weeks before the current one are accepted (RN-19).
  hoy: string;
  // Correction of a rejected week: every date must fall inside it.
  semana?: { inicio: string; fin: string };
};

// Form of RF-17a. It mirrors the obvious rules only; the server stays the source of truth (RN-19).
export function crearLibretaSchema({ hoy, semana }: Opciones) {
  const lunesActual = lunesDeSemana(hoy);
  const turno = z
    .object({
      turnoId: z.string(),
      fecha: z.string().regex(FECHA, 'Indica la fecha.'),
      entrada: z.string().regex(HORA, 'Indica la hora de entrada.'),
      salida: z.string().regex(HORA, 'Indica la hora de salida.'),
    })
    .superRefine((t, ctx) => {
      if (FECHA.test(t.fecha)) {
        if (semana && (t.fecha < semana.inicio || t.fecha > semana.fin)) {
          ctx.addIssue({
            code: 'custom',
            path: ['fecha'],
            message: `La fecha debe estar dentro de la semana del ${formatRangoSemana(semana.inicio, semana.fin)}.`,
          });
        } else if (!semana && t.fecha >= lunesActual) {
          ctx.addIssue({
            code: 'custom',
            path: ['fecha'],
            message: 'Solo se pueden capturar semanas ya cerradas (anteriores a la actual).',
          });
        }
      }
      if (HORA.test(t.entrada) && HORA.test(t.salida) && t.salida <= t.entrada) {
        ctx.addIssue({ code: 'custom', path: ['salida'], message: 'La salida debe ser posterior a la entrada.' });
      }
    });
  return z.object({
    turnos: z
      .array(turno)
      .min(1, 'Agrega al menos un turno.')
      .max(MAX_TURNOS_LIBRETA, `Puedes enviar hasta ${MAX_TURNOS_LIBRETA} turnos a la vez.`),
  });
}
