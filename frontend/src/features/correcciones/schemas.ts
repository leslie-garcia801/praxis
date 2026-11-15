import { z } from 'zod';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Form of RF-17. Mirrors the server limits for the motive only; the server checks the times (task 0037).
export const correccionSchema = z.object({
  entrada: z.string().regex(HORA, 'Indica la hora de entrada.'),
  salida: z.string().regex(HORA, 'Indica la hora de salida.'),
  salidaDiaSiguiente: z.boolean(),
  motivo: z
    .string()
    .trim()
    .min(10, 'Explica el motivo con al menos 10 caracteres.')
    .max(500, 'El motivo no puede pasar de 500 caracteres.'),
});

export type CorreccionValues = z.input<typeof correccionSchema>;
export type CorreccionOutput = z.output<typeof correccionSchema>;
