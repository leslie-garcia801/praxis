import { z } from 'zod';
import type { TipoPrograma } from '../instituciones/api';
import type { EditarExpedienteInput, Expediente, CrearSupervisorInput } from './api';

// Format-only validation (RF-10). The business rules (active institution that accepts the type,
// supervisor of the institution, period, schedule) are checked again by the backend.

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const fechaOpcional = z.string().refine((v) => v === '' || FECHA.test(v), 'La fecha debe tener el formato AAAA-MM-DD.');
const horaOpcional = z.string().refine((v) => v === '' || HORA.test(v), 'La hora debe tener el formato HH:mm (24 horas).');

export const DIAS = [
  { valor: 1, nombre: 'Lunes' },
  { valor: 2, nombre: 'Martes' },
  { valor: 3, nombre: 'Miércoles' },
  { valor: 4, nombre: 'Jueves' },
  { valor: 5, nombre: 'Viernes' },
  { valor: 6, nombre: 'Sábado' },
  { valor: 7, nombre: 'Domingo' },
] as const;

// One shape for both types; the fields of the other type stay empty and are never sent.
const baseSchema = z.object({
  institucionId: z.string(),
  supervisorId: z.string(),
  departamento: z.string().trim().max(150, 'Máximo 150 caracteres.'),
  fechaInicio: fechaOpcional,
  fechaTermino: fechaOpcional,
  diasPactados: z.array(z.number().int().min(1).max(7)),
  horaEntrada: horaOpcional,
  horaSalida: horaOpcional,
  programa: z.string().trim().max(150, 'Máximo 150 caracteres.'),
  subprograma: z.string().trim().max(150, 'Máximo 150 caracteres.'),
});

export type ExpedienteFormValues = z.infer<typeof baseSchema>;

// Practicas adds: at least one agreed day, end date after start, entry time before exit time.
// Dates and times are fixed-width strings, so comparing them as text compares them in order.
export function expedienteFormSchema(tipo: TipoPrograma) {
  return baseSchema.superRefine((v, ctx) => {
    if (tipo !== 'PRACTICAS') return;
    if (v.diasPactados.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['diasPactados'], message: 'Indica al menos un día.' });
    }
    if (v.fechaInicio && v.fechaTermino && v.fechaTermino <= v.fechaInicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['fechaTermino'],
        message: 'La fecha de término debe ser posterior a la de inicio.',
      });
    }
    if (v.horaEntrada && v.horaSalida && v.horaEntrada >= v.horaSalida) {
      ctx.addIssue({
        code: 'custom',
        path: ['horaEntrada'],
        message: 'La hora de entrada debe ser anterior a la de salida.',
      });
    }
  });
}

export function valoresDe(expediente: Expediente): ExpedienteFormValues {
  return {
    institucionId: expediente.institucion?.id ?? '',
    supervisorId: expediente.supervisor?.id ?? '',
    departamento: expediente.departamento ?? '',
    fechaInicio: expediente.fechaInicio ?? '',
    fechaTermino: expediente.fechaTermino ?? '',
    diasPactados: expediente.diasPactados,
    horaEntrada: expediente.horaEntrada ?? '',
    horaSalida: expediente.horaSalida ?? '',
    programa: expediente.programa ?? '',
    subprograma: expediente.subprograma ?? '',
  };
}

const textoONull = (v: string) => (v.trim() === '' ? null : v.trim());

// Builds the PATCH body with only the fields of the expediente type (the backend rejects the others).
export function aPayload(tipo: TipoPrograma, v: ExpedienteFormValues): EditarExpedienteInput {
  const comunes: EditarExpedienteInput = {
    supervisorId: v.supervisorId || null,
    departamento: textoONull(v.departamento),
    ...(v.institucionId ? { institucionId: v.institucionId } : {}),
    ...(v.fechaInicio ? { fechaInicio: v.fechaInicio } : {}),
  };
  if (tipo === 'PRACTICAS') {
    return {
      ...comunes,
      fechaTermino: v.fechaTermino || null,
      diasPactados: v.diasPactados,
      horaEntrada: v.horaEntrada || null,
      horaSalida: v.horaSalida || null,
    };
  }
  return { ...comunes, programa: textoONull(v.programa), subprograma: textoONull(v.subprograma) };
}

// RF-09: the student registers a supervisor that is not in the catalogue.
export const nuevoSupervisorSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre del supervisor.').max(100, 'Máximo 100 caracteres.'),
  apellidoPaterno: z.string().trim().min(1, 'Escribe el apellido paterno del supervisor.').max(100, 'Máximo 100 caracteres.'),
  correo: z.string().trim().min(1, 'El correo no es válido.').pipe(z.email('El correo no es válido.').max(150, 'Máximo 150 caracteres.')),
  titulo: z.string().trim().max(30, 'Máximo 30 caracteres.'),
  apellidoMaterno: z.string().trim().max(100, 'Máximo 100 caracteres.'),
  puesto: z.string().trim().max(150, 'Máximo 150 caracteres.'),
  departamento: z.string().trim().max(150, 'Máximo 150 caracteres.'),
  telefono: z.string().trim().max(30, 'Máximo 30 caracteres.'),
  extension: z.string().trim().max(20, 'Máximo 20 caracteres.'),
});
export type NuevoSupervisorValues = z.infer<typeof nuevoSupervisorSchema>;

export const VALORES_NUEVO_SUPERVISOR: NuevoSupervisorValues = {
  nombre: '',
  apellidoPaterno: '',
  correo: '',
  titulo: '',
  apellidoMaterno: '',
  puesto: '',
  departamento: '',
  telefono: '',
  extension: '',
};

export function aSupervisorPayload(v: NuevoSupervisorValues): CrearSupervisorInput {
  const { nombre, apellidoPaterno, correo, ...opcionales } = v;
  const resto = Object.fromEntries(Object.entries(opcionales).filter(([, valor]) => valor !== ''));
  return { nombre, apellidoPaterno, correo, ...resto };
}

// Backend field names in `faltantes` (domain/expedientes.ts) -> labels for the student.
const ETIQUETAS_FALTANTES: Record<string, string> = {
  institucionId: 'Institución',
  supervisorId: 'Supervisor',
  fechaInicio: 'Fecha de inicio',
  fechaTermino: 'Fecha de término',
  diasPactados: 'Días pactados',
  horaEntrada: 'Hora de entrada',
  horaSalida: 'Hora de salida',
};

export const etiquetaFaltante = (campo: string) => ETIQUETAS_FALTANTES[campo] ?? campo;
