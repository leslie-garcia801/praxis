import { z } from 'zod';

// RF-28: the browser's PushSubscription JSON (`subscription.toJSON()`). The endpoint is always https (a push service URL).
// `expirationTime` is part of that JSON; it is accepted and ignored.
export const suscribirSchema = z.strictObject({
  endpoint: z
    .string('El endpoint de la suscripción es obligatorio.')
    .max(2048, 'El endpoint de la suscripción es demasiado largo.')
    .refine((v) => URL.canParse(v) && new URL(v).protocol === 'https:', 'El endpoint debe ser una URL https.'),
  expirationTime: z.number().nullish(),
  keys: z.strictObject({
    p256dh: z.string('La clave p256dh es obligatoria.').min(1, 'La clave p256dh es obligatoria.').max(256, 'La clave p256dh es demasiado larga.'),
    auth: z.string('La clave auth es obligatoria.').min(1, 'La clave auth es obligatoria.').max(256, 'La clave auth es demasiado larga.'),
  }),
});

export type SuscribirInput = z.output<typeof suscribirSchema>;

export const darDeBajaSchema = z.strictObject({
  endpoint: z
    .string('El endpoint de la suscripción es obligatorio.')
    .min(1, 'El endpoint de la suscripción es obligatorio.')
    .max(2048, 'El endpoint de la suscripción es demasiado largo.'),
});
