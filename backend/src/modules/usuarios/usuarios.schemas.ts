import { z } from 'zod';

export const crearUsuarioVinculacionSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre.').max(150),
  email: z.email('El correo no es válido.').transform((e) => e.trim().toLowerCase()),
  // RN-03b: required on purpose; null means both offices.
  oficina: z.enum(['PRACTICAS', 'SERVICIO_SOCIAL'], 'Elige una oficina.').nullable(),
});

export type CrearUsuarioVinculacionInput = z.infer<typeof crearUsuarioVinculacionSchema>;
