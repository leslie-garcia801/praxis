import { z } from 'zod';
import { motivo } from '../expedientes/expedientes.schemas.js';
import { MAX_COMENTARIO, MINIMO_COMENTARIO } from '../validacion/validacion.schemas.js';

export const semanaIdParamsSchema = z.object({
  id: z.uuid('El identificador de la semana no es válido.'),
});

// RF-20: the logbook is saved as a draft with any length up to 5000 characters; the 50-character minimum
// (RN-17) is checked when the week is sent.
export const MAX_ACTIVIDADES = 5000;

export const bitacoraSchema = z
  .object({
    actividades: z
      .string('Las actividades deben ser texto.')
      .max(MAX_ACTIVIDADES, `Las actividades no pueden exceder ${MAX_ACTIVIDADES} caracteres.`),
  })
  .strict();

export type BitacoraInput = z.output<typeof bitacoraSchema>;

// RF-22: the office validates or rejects on behalf of the supervisor. Every action asks for a reason (audit); a
// rejection also needs the comment the student will read, with the same rule as the supervisor link.
export const resolverSemanaSchema = z
  .strictObject({
    accion: z.enum(['VALIDAR', 'RECHAZAR'], 'La acción debe ser VALIDAR o RECHAZAR.'),
    motivo,
    comentario: z
      .string('El comentario debe ser texto.')
      .trim()
      .max(MAX_COMENTARIO, `El comentario no puede exceder ${MAX_COMENTARIO} caracteres.`)
      .optional(),
  })
  .superRefine((d, ctx) => {
    if (d.accion === 'RECHAZAR' && (d.comentario ?? '').length < MINIMO_COMENTARIO) {
      ctx.addIssue({ code: 'custom', path: ['comentario'], message: `Escribe al menos ${MINIMO_COMENTARIO} caracteres para explicar el rechazo.` });
    }
    if (d.accion === 'VALIDAR' && d.comentario !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['comentario'], message: 'Una validación no lleva comentario.' });
    }
  });

export type ResolverSemanaInput = z.output<typeof resolverSemanaSchema>;

// RF-17a: shifts copied from the paper notebook. Date and times are local wall-clock values (America/Monterrey).
export const MAX_TURNOS_LIBRETA = 200;

const turnoLibretaSchema = z.strictObject({
  id: z.uuid('El identificador del turno no es válido.'),
  fecha: z.iso.date('La fecha debe tener el formato AAAA-MM-DD.'),
  entrada: z.string('La hora de entrada debe ser texto.').regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora de entrada debe tener el formato HH:MM.'),
  salida: z.string('La hora de salida debe ser texto.').regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora de salida debe tener el formato HH:MM.'),
});

export const libretaSchema = z.strictObject({
  turnos: z
    .array(turnoLibretaSchema, 'Indica los turnos de la libreta.')
    .min(1, 'Indica al menos un turno.')
    .max(MAX_TURNOS_LIBRETA, `No puedes registrar más de ${MAX_TURNOS_LIBRETA} turnos a la vez.`),
});

export type LibretaInput = z.output<typeof libretaSchema>;
export type TurnoLibretaInput = LibretaInput['turnos'][number];
