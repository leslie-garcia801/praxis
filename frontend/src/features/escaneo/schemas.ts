import { z } from 'zod';

// RF-15: the short code has 6 characters. The backend (escaneoSchema) is the source of truth.
export const codigoCortoSchema = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, 'El código tiene 6 caracteres.'),
});
export type CodigoCortoValues = z.input<typeof codigoCortoSchema>;
export type CodigoCortoOutput = z.output<typeof codigoCortoSchema>;
