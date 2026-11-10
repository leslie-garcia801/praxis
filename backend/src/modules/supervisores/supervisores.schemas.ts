import { z } from 'zod';

export const institucionIdParamsSchema = z.object({ id: z.uuid('El identificador de la institución no es válido.') });
export const supervisorIdParamsSchema = z.object({ id: z.uuid('El identificador del supervisor no es válido.') });

// Optional text: surrounding spaces are trimmed and an empty string means "no value".
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v));
const textoRequerido = (mensaje: string, max: number) => z.string().trim().min(1, mensaje).max(max, `Máximo ${max} caracteres.`);
const correo = z
  .email('El correo no es válido.')
  .max(150)
  .transform((v) => v.toLowerCase());

// RF-09: manual registration, as in the Edumedia request form.
export const crearSupervisorSchema = z.object({
  nombre: textoRequerido('Escribe el nombre del supervisor.', 100),
  apellidoPaterno: textoRequerido('Escribe el apellido paterno del supervisor.', 100),
  correo,
  titulo: textoOpcional(30).nullish().transform((v) => v ?? null),
  apellidoMaterno: textoOpcional(100).nullish().transform((v) => v ?? null),
  puesto: textoOpcional(150).nullish().transform((v) => v ?? null),
  departamento: textoOpcional(150).nullish().transform((v) => v ?? null),
  telefono: textoOpcional(30).nullish().transform((v) => v ?? null),
  extension: textoOpcional(20).nullish().transform((v) => v ?? null),
});

export type CrearSupervisorInput = z.output<typeof crearSupervisorSchema>;

// RF-09: partial edit. Optional fields can be cleared with null; required ones cannot.
// `confirmado` and `institucionId` are not editable here (confirmation happens with the case file, RF-10).
export const editarSupervisorSchema = z
  .object({
    nombre: textoRequerido('Escribe el nombre del supervisor.', 100),
    apellidoPaterno: textoRequerido('Escribe el apellido paterno del supervisor.', 100),
    correo,
    titulo: textoOpcional(30).nullable(),
    apellidoMaterno: textoOpcional(100).nullable(),
    puesto: textoOpcional(150).nullable(),
    departamento: textoOpcional(150).nullable(),
    telefono: textoOpcional(30).nullable(),
    extension: textoOpcional(20).nullable(),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Indica al menos un campo para editar.');

export type EditarSupervisorInput = z.output<typeof editarSupervisorSchema>;
