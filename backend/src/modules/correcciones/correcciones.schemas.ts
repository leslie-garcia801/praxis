import { z } from 'zod';
import { MAX_COMENTARIO, MINIMO_COMENTARIO } from '../validacion/validacion.schemas.js';

const instante = (campo: string) =>
  z.iso
    .datetime({ offset: true, error: `La ${campo} debe ser una fecha ISO 8601 con zona.` })
    .transform((v) => new Date(v));

export const asistenciaIdParamsSchema = z.object({
  id: z.uuid('El identificador del turno no es válido.'),
});

// RF-17: the student proposes the correct entry and exit with a reason.
export const solicitarCorreccionSchema = z
  .object({
    entradaNueva: instante('hora de entrada'),
    salidaNueva: instante('hora de salida'),
    motivo: z
      .string('Escribe el motivo de la corrección.')
      .trim()
      .min(10, 'Explica el motivo con al menos 10 caracteres.')
      .max(500, 'El motivo no puede pasar de 500 caracteres.'),
  })
  .strict();

export type SolicitarCorreccionInput = z.output<typeof solicitarCorreccionSchema>;

export const correccionIdParamsSchema = z.object({
  id: z.uuid('El identificador de la solicitud no es válido.'),
});

// RF-17: the office approves, or rejects with the comment the student will read (same rule as a rejected week).
export const resolverCorreccionSchema = z
  .strictObject({
    accion: z.enum(['APROBAR', 'RECHAZAR'], 'La acción debe ser APROBAR o RECHAZAR.'),
    comentario: z
      .string('El comentario debe ser texto.')
      .trim()
      .max(MAX_COMENTARIO, `El comentario no puede exceder ${MAX_COMENTARIO} caracteres.`)
      .optional(),
  })
  .superRefine((d, ctx) => {
    if (d.accion === 'RECHAZAR' && (d.comentario ?? '').length < MINIMO_COMENTARIO) {
      ctx.addIssue({ code: 'custom', path: ['comentario'], message: `Escribe al menos ${MINIMO_COMENTARIO} caracteres para explicar el rechazo.` });
    }
    if (d.accion === 'APROBAR' && d.comentario !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['comentario'], message: 'Una aprobación no lleva comentario.' });
    }
  });

export type ResolverCorreccionInput = z.output<typeof resolverCorreccionSchema>;

// The office lists PENDIENTE requests unless it asks for another state; the student always gets all of theirs.
export const listarCorreccionesQuerySchema = z.object({
  estado: z.enum(['PENDIENTE', 'APROBADA', 'RECHAZADA'], 'El estado debe ser PENDIENTE, APROBADA o RECHAZADA.').optional(),
});

export type ListarCorreccionesQuery = z.output<typeof listarCorreccionesQuerySchema>;
