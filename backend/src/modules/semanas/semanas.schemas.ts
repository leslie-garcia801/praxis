import { z } from 'zod';

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
