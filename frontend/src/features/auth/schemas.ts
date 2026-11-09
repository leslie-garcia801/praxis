import { z } from 'zod';

// Bounds mirror the backend (activacion.schemas.ts, me.schemas.ts); the backend is the source of truth.
export const MATRICULA_REGEX = /^\d{14}$/;

const PASSWORD_MIN_MESSAGE = 'La contraseña debe tener al menos 8 caracteres.';
const passwordSchema = z.string().min(8, PASSWORD_MIN_MESSAGE).max(128, 'La contraseña no puede tener más de 128 caracteres.');

export const loginSchema = z.object({
  identificador: z.string().trim().min(1, 'Escribe tu matrícula o correo.'),
  password: z.string().min(1, 'Escribe tu contraseña.').max(128),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const identidadSchema = z.object({
  matricula: z.string().trim().regex(MATRICULA_REGEX, 'La matrícula tiene 14 dígitos.'),
  nombre: z.string().trim().min(1, 'Escribe tu nombre.').max(100),
  apellidoPaterno: z.string().trim().min(1, 'Escribe tu primer apellido.').max(100),
});
export type IdentidadValues = z.infer<typeof identidadSchema>;

export const contrasenaActivacionSchema = z
  .object({
    password: passwordSchema,
    confirmar: z.string(),
    email: z
      .string()
      .trim()
      .refine((v) => v === '' || z.email().safeParse(v).success, 'El correo no es válido.'),
    avisoPrivacidad: z.boolean().refine((v) => v, 'Debes aceptar el aviso de privacidad.'),
  })
  .refine((d) => d.password === d.confirmar, { path: ['confirmar'], message: 'Las contraseñas no coinciden.' });
export type ContrasenaActivacionValues = z.infer<typeof contrasenaActivacionSchema>;

export const cambiarContrasenaSchema = z
  .object({
    passwordActual: z.string().min(1, 'Escribe tu contraseña actual.').max(128),
    passwordNueva: passwordSchema,
    confirmar: z.string(),
  })
  .refine((d) => d.passwordNueva === d.confirmar, { path: ['confirmar'], message: 'Las contraseñas no coinciden.' })
  .refine((d) => d.passwordNueva !== d.passwordActual, {
    path: ['passwordNueva'],
    message: 'La contraseña nueva debe ser distinta de la actual.',
  });
export type CambiarContrasenaValues = z.infer<typeof cambiarContrasenaSchema>;
