import { z } from 'zod';

const nombreSchema = z.string().trim().min(1, 'Escribe tu nombre.').max(100);

export const verificarSchema = z.object({
  matricula: z.string().trim().regex(/^\d{14}$/, 'La matrícula tiene 14 dígitos.'),
  nombre: nombreSchema,
  apellidoPaterno: z.string().trim().min(1, 'Escribe tu primer apellido.').max(100),
});

export const activarSchema = verificarSchema.extend({
  // Same bounds as Better Auth's defaults (8–128).
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(128),
  // RF-02: the email is optional.
  email: z.email('El correo no es válido.').optional(),
});

export type VerificarInput = z.infer<typeof verificarSchema>;
export type ActivarInput = z.infer<typeof activarSchema>;
