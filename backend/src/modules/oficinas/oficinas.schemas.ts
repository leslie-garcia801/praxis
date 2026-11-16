import { z } from 'zod';

export const oficinaParamSchema = z.object({ oficina: z.enum(['SERVICIO_SOCIAL', 'PRACTICAS'], 'Elige una oficina válida.') });

export const guardarResponsableSchema = z
  .object({
    nombre: z.string('Escribe el nombre.').trim().min(1, 'Escribe el nombre.').max(150, 'El nombre es demasiado largo (máximo 150 caracteres).'),
    cargo: z.string('Escribe el cargo.').trim().min(1, 'Escribe el cargo.').max(150, 'El cargo es demasiado largo (máximo 150 caracteres).'),
  })
  .strict();

export type GuardarResponsableInput = z.infer<typeof guardarResponsableSchema>;
