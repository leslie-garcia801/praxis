import { z } from 'zod';

const TURNOS = ['MATUTINO', 'VESPERTINO'] as const;

const idParams = z.object({ id: z.uuid('El identificador de la institución no es válido.') });
export const institucionIdParamsSchema = idParams;

// Optional text: surrounding spaces are trimmed and an empty string means "no value".
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v));
const textoRequerido = (mensaje: string, max: number) => z.string().trim().min(1, mensaje).max(max, `Máximo ${max} caracteres.`);

const rfc = z
  .string()
  .trim()
  .max(13, 'El RFC tiene máximo 13 caracteres.')
  .transform((v) => (v === '' ? null : v.toUpperCase()));
const correo = z
  .email('El correo no es válido.')
  .max(150)
  .transform((v) => v.toLowerCase());
const cupo = z.number('El cupo debe ser un número.').int('El cupo debe ser un número entero.').min(0, 'El cupo no puede ser negativo.');
const turnos = z.array(z.enum(TURNOS, 'Turno no válido.')).transform((v) => [...new Set(v)]);
const carreraIds = z.array(z.uuid('Carrera no válida.')).transform((v) => [...new Set(v)]);

const camposComunes = {
  rfc: rfc.nullish().transform((v) => v ?? null),
  giro: textoOpcional(150).nullish().transform((v) => v ?? null),
  numExterior: textoOpcional(20).nullish().transform((v) => v ?? null),
  numInterior: textoOpcional(20).nullish().transform((v) => v ?? null),
  colonia: textoOpcional(100).nullish().transform((v) => v ?? null),
  codigoPostal: textoOpcional(10).nullish().transform((v) => v ?? null),
  telefono: textoOpcional(30).nullish().transform((v) => v ?? null),
  correo: correo.nullish().transform((v) => v ?? null),
  representante: textoOpcional(150).nullish().transform((v) => v ?? null),
  horarioAtencion: textoOpcional(150).nullish().transform((v) => v ?? null),
  cupo: cupo.nullish().transform((v) => v ?? null),
};

// RF-08: manual registration. Defaults: accepts both programs, active, no turnos or carreras yet.
export const crearInstitucionSchema = z.object({
  nombre: textoRequerido('Escribe el nombre de la institución.', 200),
  calle: textoRequerido('Escribe la calle.', 200),
  municipio: textoRequerido('Escribe el municipio.', 100),
  estado: textoRequerido('Escribe el estado.', 100).default('Nuevo León'),
  esPlantel: z.boolean().default(false),
  turnos: turnos.default([]),
  aceptaServicio: z.boolean().default(true),
  aceptaPracticas: z.boolean().default(true),
  activa: z.boolean().default(true),
  carreraIds: carreraIds.default([]),
  ...camposComunes,
});

export type CrearInstitucionInput = z.output<typeof crearInstitucionSchema>;

// RF-08: partial edit. Optional fields can be cleared with null; required ones cannot.
export const editarInstitucionSchema = z
  .object({
    nombre: textoRequerido('Escribe el nombre de la institución.', 200),
    calle: textoRequerido('Escribe la calle.', 200),
    municipio: textoRequerido('Escribe el municipio.', 100),
    estado: textoRequerido('Escribe el estado.', 100),
    esPlantel: z.boolean(),
    turnos,
    aceptaServicio: z.boolean(),
    aceptaPracticas: z.boolean(),
    activa: z.boolean(),
    carreraIds,
    rfc: rfc.nullable(),
    giro: textoOpcional(150).nullable(),
    numExterior: textoOpcional(20).nullable(),
    numInterior: textoOpcional(20).nullable(),
    colonia: textoOpcional(100).nullable(),
    codigoPostal: textoOpcional(10).nullable(),
    telefono: textoOpcional(30).nullable(),
    correo: correo.nullable(),
    representante: textoOpcional(150).nullable(),
    horarioAtencion: textoOpcional(150).nullable(),
    cupo: cupo.nullable(),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Indica al menos un campo para editar.');

export type EditarInstitucionInput = z.output<typeof editarInstitucionSchema>;

const booleanoDeQuery = z.enum(['true', 'false'], 'Debe ser true o false.').transform((v) => v === 'true');

// RF-06: query string filters. `tipo` also accepts SERVICIO as a shorthand for SERVICIO_SOCIAL.
export const listarInstitucionesQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  municipio: z.string().trim().max(100).optional(),
  colonia: z.string().trim().max(100).optional(),
  carrera: z.uuid('Carrera no válida.').optional(),
  turno: z.enum(TURNOS, 'Turno no válido.').optional(),
  tipo: z.enum(['SERVICIO', 'SERVICIO_SOCIAL', 'PRACTICAS'], 'Tipo no válido.').optional(),
  conCupo: booleanoDeQuery.optional(),
});

export type ListarInstitucionesQuery = z.output<typeof listarInstitucionesQuerySchema>;
