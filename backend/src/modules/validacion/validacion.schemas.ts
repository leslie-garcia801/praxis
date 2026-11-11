import { z } from 'zod';

export const tokenParamsSchema = z.object({
  token: z.string().min(1).max(200),
});

// RF-22: a rejection needs a comment of at least 5 characters, ignoring spaces at both ends.
export const MINIMO_COMENTARIO = 5;
export const MAX_COMENTARIO = 1000;

const decisionSchema = z
  .object({
    semanaId: z.uuid('El identificador de la semana no es válido.'),
    accion: z.enum(['VALIDAR', 'RECHAZAR'], 'La acción debe ser VALIDAR o RECHAZAR.'),
    comentario: z.string('El comentario debe ser texto.').trim().max(MAX_COMENTARIO, `El comentario no puede exceder ${MAX_COMENTARIO} caracteres.`).optional(),
  })
  .strict()
  .refine((d) => d.accion !== 'RECHAZAR' || (d.comentario ?? '').length >= MINIMO_COMENTARIO, {
    path: ['comentario'],
    message: `Escribe al menos ${MINIMO_COMENTARIO} caracteres para explicar el rechazo.`,
  });

// RF-21a: one or many weeks of the link, in one request.
export const decisionesSchema = z
  .object({
    decisiones: z
      .array(decisionSchema, 'Indica las decisiones.')
      .min(1, 'Indica al menos una decisión.')
      .refine((lista) => new Set(lista.map((d) => d.semanaId)).size === lista.length, 'Una semana no puede aparecer dos veces.'),
  })
  .strict();

export type Decision = z.output<typeof decisionSchema>;
export type DecisionesInput = z.output<typeof decisionesSchema>;
