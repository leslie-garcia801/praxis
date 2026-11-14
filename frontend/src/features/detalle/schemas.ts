import { z } from 'zod';
import { nuevoSupervisorSchema, type NuevoSupervisorValues } from '../expediente/schemas';
import type { SupervisorOficina, EditarSupervisorInput } from './api';

// Format-only validation of the office actions (RF-12, RF-22); the API checks the rules again.

export const motivoSchema = z.string().trim().min(1, 'Indica el motivo.').max(500, 'Máximo 500 caracteres.');

// RF-22: the comment of a rejection is what the student reads.
export const comentarioRechazoSchema = z
  .string()
  .trim()
  .min(5, 'Escribe al menos 5 caracteres para explicar el rechazo.')
  .max(1000, 'Máximo 1000 caracteres.');

// Returns the first error message or null when the value is valid.
export function primerError(schema: z.ZodType, valor: string): string | null {
  const r = schema.safeParse(valor);
  return r.success ? null : (r.error.issues[0]?.message ?? 'Valor no válido.');
}

// The edit form has the same fields and rules as the new supervisor form.
export const editarSupervisorSchema = nuevoSupervisorSchema;

export function valoresDeSupervisor(s: SupervisorOficina): NuevoSupervisorValues {
  return {
    titulo: s.titulo ?? '',
    nombre: s.nombre,
    apellidoPaterno: s.apellidoPaterno,
    apellidoMaterno: s.apellidoMaterno ?? '',
    puesto: s.puesto ?? '',
    departamento: s.departamento ?? '',
    correo: s.correo ?? '',
    telefono: s.telefono ?? '',
    extension: s.extension ?? '',
  };
}

// All fields are sent: an empty optional one clears the stored value.
export function aEditarSupervisorPayload(v: NuevoSupervisorValues): EditarSupervisorInput {
  const o = (x: string) => (x === '' ? null : x);
  return {
    titulo: o(v.titulo),
    nombre: v.nombre,
    apellidoPaterno: v.apellidoPaterno,
    apellidoMaterno: o(v.apellidoMaterno),
    puesto: o(v.puesto),
    departamento: o(v.departamento),
    correo: v.correo,
    telefono: o(v.telefono),
    extension: o(v.extension),
  };
}
