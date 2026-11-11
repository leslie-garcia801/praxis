import { z } from 'zod';

// RF-14, RF-15: exactly one of `token` (QR) or `codigoCorto` (typed by hand).
// `hora` is the device clock and only matters for offline records (RN-14).
export const escaneoSchema = z
  .object({
    id: z.uuid('El identificador del registro no es válido.'),
    token: z.string().trim().min(1, 'El token no puede estar vacío.').max(200, 'El token no es válido.').optional(),
    codigoCorto: z
      .string()
      .trim()
      .min(1, 'El código no puede estar vacío.')
      .max(20, 'El código no es válido.')
      .transform((v) => v.toUpperCase())
      .optional(),
    hora: z.iso
      .datetime({ offset: true, error: 'La hora debe ser una fecha ISO 8601 con zona.' })
      .transform((v) => new Date(v))
      .optional(),
    sinConexion: z.boolean('sinConexion debe ser verdadero o falso.').default(false),
  })
  .strict()
  .refine((v) => (v.token === undefined) !== (v.codigoCorto === undefined), {
    message: 'Indica exactamente uno: token o codigoCorto.',
    path: ['token'],
  })
  .refine((v) => !v.sinConexion || v.hora !== undefined, {
    message: 'Un registro sin conexión debe incluir la hora del dispositivo.',
    path: ['hora'],
  });

export type EscaneoInput = z.output<typeof escaneoSchema>;

// RF-19: `semana` is any calendar day (it is normalized to its Monday); `expedienteId` is optional for the
// student (defaults to their active case file) and required for the office (checked in the service).
export const historialQuerySchema = z.object({
  semana: z.iso.date('La semana debe tener el formato AAAA-MM-DD.').optional(),
  expedienteId: z.uuid('El identificador del expediente no es válido.').optional(),
});

export type HistorialQuery = z.output<typeof historialQuerySchema>;
