import { z } from 'zod';

export const cambiarContrasenaSchema = z
  .object({
    passwordActual: z.string().min(1, 'Escribe tu contraseña actual.').max(128),
    // Same bounds as Better Auth's defaults (8–128).
    passwordNueva: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(128),
  })
  .refine((d) => d.passwordNueva !== d.passwordActual, {
    path: ['passwordNueva'],
    message: 'La contraseña nueva debe ser distinta de la actual.',
  });

export type CambiarContrasenaInput = z.infer<typeof cambiarContrasenaSchema>;
