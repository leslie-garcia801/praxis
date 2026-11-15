import { z } from 'zod';

const instante = (campo: string) =>
  z.iso
    .datetime({ offset: true, error: `La ${campo} debe ser una fecha ISO 8601 con zona.` })
    .transform((v) => new Date(v));

export const asistenciaIdParamsSchema = z.object({
  id: z.uuid('El identificador del turno no es válido.'),
});

// RF-17: the student proposes the correct entry and exit with a reason.
export const solicitarCorreccionSchema = z
  .object({
    entradaNueva: instante('hora de entrada'),
    salidaNueva: instante('hora de salida'),
    motivo: z
      .string('Escribe el motivo de la corrección.')
      .trim()
      .min(10, 'Explica el motivo con al menos 10 caracteres.')
      .max(500, 'El motivo no puede pasar de 500 caracteres.'),
  })
  .strict();

export type SolicitarCorreccionInput = z.output<typeof solicitarCorreccionSchema>;
