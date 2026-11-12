import { z } from 'zod';

// RF-22: the rejection comment has at least 5 characters. The backend (validacion.schemas) is the source of truth.
export const rechazoSchema = z.object({
  comentario: z.string().trim().min(5, 'Escribe al menos 5 caracteres.').max(1000, 'Máximo 1000 caracteres.'),
});
export type RechazoValues = z.input<typeof rechazoSchema>;
