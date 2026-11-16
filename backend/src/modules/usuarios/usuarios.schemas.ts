import { z } from 'zod';

export const crearUsuarioVinculacionSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre.').max(150),
  email: z.email('El correo no es válido.').transform((e) => e.trim().toLowerCase()),
  // RN-03b: required on purpose; null means both offices.
  oficina: z.enum(['PRACTICAS', 'SERVICIO_SOCIAL'], 'Elige una oficina.').nullable(),
});

export type CrearUsuarioVinculacionInput = z.infer<typeof crearUsuarioVinculacionSchema>;

export const usuarioIdParamsSchema = z.object({
  id: z.uuid('El identificador del usuario no es válido.'),
});

// Same bounds as the create schema. Email and rol are not editable: the email is the sign-in identity.
// `oficina` is only meaningful for vinculación users (checked in the service); null means both offices.
export const editarUsuarioSchema = z
  .strictObject({
    nombre: z.string().trim().min(1, 'Escribe el nombre.').max(150),
    oficina: z.enum(['PRACTICAS', 'SERVICIO_SOCIAL'], 'Elige una oficina.').nullable(),
    activo: z.boolean('El estado del usuario no es válido.'),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Indica al menos un campo para editar.');

export type EditarUsuarioInput = z.output<typeof editarUsuarioSchema>;
