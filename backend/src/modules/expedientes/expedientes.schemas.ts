import { z } from 'zod';

export const expedienteIdParamsSchema = z.object({ id: z.uuid('El identificador del expediente no es válido.') });

const ESTADOS = ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO', 'FINALIZADO', 'CANCELADO'] as const;

export const listarExpedientesQuerySchema = z.object({
  estado: z.enum(ESTADOS, 'Estado no válido.').optional(),
});

export type ListarExpedientesQuery = z.output<typeof listarExpedientesQuerySchema>;

// Optional text: surrounding spaces are trimmed and an empty string means "no value".
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v));

// Calendar date "YYYY-MM-DD" (no time, no zone: it is a day, not an instant, RN-15).
const fecha = z.iso.date('La fecha debe tener el formato AAAA-MM-DD.');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora debe tener el formato HH:mm (24 horas).');
// 1 = Monday … 7 = Sunday; sorted and without repeats.
const dias = z
  .array(z.number('Día no válido.').int('Día no válido.').min(1, 'Día no válido.').max(7, 'Día no válido.'))
  .min(1, 'Indica al menos un día.')
  .transform((v) => [...new Set(v)].sort((a, b) => a - b));

// RF-10: what the student (while PENDIENTE) or the office can fill in. `tipo`, `estado`, `metaHoras` and
// `minutosTransferidos` are not editable: the schema is strict so they are rejected instead of ignored.
export const editarExpedienteSchema = z
  .strictObject({
    institucionId: z.uuid('Institución no válida.'),
    supervisorId: z.uuid('Supervisor no válido.').nullable(),
    departamento: textoOpcional(150).nullable(),
    fechaInicio: fecha,
    // Practicas only
    fechaTermino: fecha.nullable(),
    diasPactados: dias,
    horaEntrada: hora.nullable(),
    horaSalida: hora.nullable(),
    // Servicio social only
    programa: textoOpcional(150).nullable(),
    subprograma: textoOpcional(150).nullable(),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Indica al menos un campo para editar.');

export type EditarExpedienteInput = z.output<typeof editarExpedienteSchema>;

// RF-12: every action asks for a reason; it goes to the audit log.
export const motivo = z
  .string('Indica el motivo.')
  .trim()
  .min(1, 'Indica el motivo.')
  .max(500, 'Máximo 500 caracteres.');

export const cambiarEstadoSchema = z.strictObject({
  accion: z.enum(['SUSPENDER', 'REACTIVAR', 'CANCELAR'], 'Acción no válida.'),
  motivo,
});
export type CambiarEstadoInput = z.output<typeof cambiarEstadoSchema>;

// RN-12: vinculación decides whether the validated hours travel to the new case file.
export const transferirExpedienteSchema = z.strictObject({
  institucionId: z.uuid('Institución no válida.'),
  conservarHoras: z.boolean('Indica si se conservan las horas.'),
  motivo,
});
export type TransferirExpedienteInput = z.output<typeof transferirExpedienteSchema>;

export const MAX_ALUMNOS_ASIGNAR = 500;

// RF-01, RN-03a: repeated ids are processed once.
export const asignarProgramaSchema = z.strictObject({
  alumnoIds: z
    .array(z.uuid('Alumno no válido.'), 'Indica los alumnos.')
    .min(1, 'Indica al menos un alumno.')
    .max(MAX_ALUMNOS_ASIGNAR, `Máximo ${MAX_ALUMNOS_ASIGNAR} alumnos por solicitud.`)
    .transform((ids) => [...new Set(ids)]),
});
export type AsignarProgramaInput = z.output<typeof asignarProgramaSchema>;

export const CAMPOS_SOLO_PRACTICAS = ['fechaTermino', 'diasPactados', 'horaEntrada', 'horaSalida'] as const;
export const CAMPOS_SOLO_SERVICIO = ['programa', 'subprograma'] as const;

// RF-27: optional calendar range (local days, RN-15). The order is checked in the service so the message is specific.
const fechaReporte = z.preprocess((v) => (v === '' ? undefined : v), z.iso.date('La fecha debe tener el formato AAAA-MM-DD.').optional());

export const reporteQuerySchema = z.object({ desde: fechaReporte, hasta: fechaReporte });

export type ReporteQuery = z.output<typeof reporteQuerySchema>;
