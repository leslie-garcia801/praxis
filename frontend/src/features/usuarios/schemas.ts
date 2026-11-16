import { z } from 'zod';

// Mirrors backend usuarios.schemas.ts; the backend is the source of truth.
// "AMBAS" is a form-only value that is sent as `oficina: null` (RN-03b).
export const crearUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre.').max(150, 'El nombre no puede tener más de 150 caracteres.'),
  email: z.string().trim().pipe(z.email('El correo no es válido.')),
  oficina: z.enum(['PRACTICAS', 'SERVICIO_SOCIAL', 'AMBAS'], { error: 'Elige una oficina.' }),
});
export type CrearUsuarioValues = z.infer<typeof crearUsuarioSchema>;

// Edit form (task 0057). "AMBAS" is sent as `oficina: null`; admins have no office field.
export const editarUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre.').max(150, 'El nombre no puede tener más de 150 caracteres.'),
  oficina: z.enum(['PRACTICAS', 'SERVICIO_SOCIAL', 'AMBAS']),
});
export type EditarUsuarioValues = z.infer<typeof editarUsuarioSchema>;
