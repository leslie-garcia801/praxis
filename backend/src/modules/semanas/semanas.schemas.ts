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
