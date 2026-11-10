import { z } from 'zod';
import type { Institucion, InstitucionInput } from './api';

// Mirrors backend instituciones.schemas.ts (formats and lengths only); the backend is the source of truth.
const requerido = (mensaje: string, max: number) =>
  z.string().trim().min(1, mensaje).max(max, `Máximo ${max} caracteres.`);
const opcional = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`);

export const institucionFormSchema = z.object({
  nombre: requerido('Escribe el nombre de la institución.', 200),
  rfc: z.string().trim().max(13, 'El RFC tiene máximo 13 caracteres.'),
  giro: opcional(150),
  calle: requerido('Escribe la calle.', 200),
  numExterior: opcional(20),
  numInterior: opcional(20),
  colonia: opcional(100),
  codigoPostal: opcional(10),
  municipio: requerido('Escribe el municipio.', 100),
  estado: requerido('Escribe el estado.', 100),
  esPlantel: z.boolean(),
  telefono: opcional(30),
  correo: z
    .string()
    .trim()
    .max(150, 'Máximo 150 caracteres.')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'El correo no es válido.'),
  representante: opcional(150),
  horarioAtencion: opcional(150),
  turnos: z.array(z.enum(['MATUTINO', 'VESPERTINO'])),
  aceptaServicio: z.boolean(),
  aceptaPracticas: z.boolean(),
  // Empty means "sin dato" (null).
  cupo: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+$/.test(v), 'El cupo debe ser un número entero, sin negativos.'),
  activa: z.boolean(),
  carreraIds: z.array(z.string()),
});
export type InstitucionFormValues = z.infer<typeof institucionFormSchema>;

export const VALORES_NUEVA: InstitucionFormValues = {
  nombre: '',
  rfc: '',
  giro: '',
  calle: '',
  numExterior: '',
  numInterior: '',
  colonia: '',
  codigoPostal: '',
  municipio: '',
  estado: 'Nuevo León',
  esPlantel: false,
  telefono: '',
  correo: '',
  representante: '',
  horarioAtencion: '',
  turnos: [],
  aceptaServicio: true,
  aceptaPracticas: true,
  cupo: '',
  activa: true,
  carreraIds: [],
};

export function valoresDe(i: Institucion): InstitucionFormValues {
  return {
    nombre: i.nombre,
    rfc: i.rfc ?? '',
    giro: i.giro ?? '',
    calle: i.calle,
    numExterior: i.numExterior ?? '',
    numInterior: i.numInterior ?? '',
    colonia: i.colonia ?? '',
    codigoPostal: i.codigoPostal ?? '',
    municipio: i.municipio,
    estado: i.estado,
    esPlantel: i.esPlantel,
    telefono: i.telefono ?? '',
    correo: i.correo ?? '',
    representante: i.representante ?? '',
    horarioAtencion: i.horarioAtencion ?? '',
    turnos: i.turnos,
    aceptaServicio: i.aceptaServicio,
    aceptaPracticas: i.aceptaPracticas,
    cupo: i.cupo === null ? '' : String(i.cupo),
    activa: i.activa,
    carreraIds: i.carreras.map((c) => c.id),
  };
}

const textoONull = (v: string) => (v.trim() === '' ? null : v.trim());

// Empty optional fields go out as null so an edit can clear them.
export function aPayload(v: InstitucionFormValues): InstitucionInput {
  return {
    nombre: v.nombre,
    rfc: textoONull(v.rfc),
    giro: textoONull(v.giro),
    calle: v.calle,
    numExterior: textoONull(v.numExterior),
    numInterior: textoONull(v.numInterior),
    colonia: textoONull(v.colonia),
    codigoPostal: textoONull(v.codigoPostal),
    municipio: v.municipio,
    estado: v.estado,
    esPlantel: v.esPlantel,
    telefono: textoONull(v.telefono),
    correo: textoONull(v.correo),
    representante: textoONull(v.representante),
    horarioAtencion: textoONull(v.horarioAtencion),
    turnos: v.turnos,
    aceptaServicio: v.aceptaServicio,
    aceptaPracticas: v.aceptaPracticas,
    cupo: v.cupo.trim() === '' ? null : Number(v.cupo),
    activa: v.activa,
    carreraIds: v.carreraIds,
  };
}
