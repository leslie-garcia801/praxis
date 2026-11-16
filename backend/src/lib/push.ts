import webpush from 'web-push';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';

// Every push notification goes through here (RF-28). Three modes by environment:
// - test: notifications are kept in memory (see notificacionesEnviadas / limpiarNotificaciones).
// - development without VAPID keys: the notification is printed to the console.
// - production without VAPID keys: push is off; nothing is sent and a warning is logged once.
// - otherwise: web-push with the VAPID keys.
export type MensajePush = { titulo: string; cuerpo: string; url: string };

export type NotificacionEnviada = MensajePush & { usuarioId: string; endpoint: string };

export type ResultadoPush = {
  enviadas: number;
  // Subscriptions deleted because the push service answered 404 or 410 (expired or revoked).
  eliminadas: number;
  // Any other failure; never thrown, so a job can report them.
  errores: { endpoint: string; mensaje: string }[];
};

const bandeja: NotificacionEnviada[] = [];

/** Notifications "sent" in test mode, in order. Returns a copy. */
export const notificacionesEnviadas = (): NotificacionEnviada[] => [...bandeja];

/** Empties the in-memory outbox (test mode). */
export const limpiarNotificaciones = (): void => {
  bandeja.length = 0;
};

const ENDPOINT_CADUCADO = new Set([404, 410]);

let vapidConfigurado = false;

function enviarPorWebPush(suscripcion: { endpoint: string; p256dh: string; auth: string }, mensaje: MensajePush) {
  if (!vapidConfigurado) {
    webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    vapidConfigurado = true;
  }
  return webpush.sendNotification(
    { endpoint: suscripcion.endpoint, keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth } },
    JSON.stringify({ titulo: mensaje.titulo, cuerpo: mensaje.cuerpo, url: mensaje.url }),
  );
}

const statusDe = (error: unknown): number | undefined =>
  typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : undefined;

/** RF-28: production without VAPID keys (test and development never count as off). */
export const pushApagado = (): boolean => env.NODE_ENV === 'production' && !env.VAPID_PUBLIC_KEY;

export const AVISO_PUSH_APAGADO = 'RF-28: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT no están definidas: las notificaciones push están apagadas.';

let avisoMostrado = false;

/** Sends the message to every subscription of the user. One bad subscription never stops the rest. */
export async function enviarPush(usuarioId: string, mensaje: MensajePush): Promise<ResultadoPush> {
  const resultado: ResultadoPush = { enviadas: 0, eliminadas: 0, errores: [] };
  if (pushApagado()) {
    if (!avisoMostrado) console.warn(AVISO_PUSH_APAGADO);
    avisoMostrado = true;
    return resultado;
  }
  const suscripciones = await prisma.suscripcionPush.findMany({ where: { usuarioId } });

  for (const suscripcion of suscripciones) {
    try {
      if (env.NODE_ENV === 'test') {
        bandeja.push({ ...mensaje, usuarioId, endpoint: suscripcion.endpoint });
      } else if (env.VAPID_PUBLIC_KEY) {
        await enviarPorWebPush(suscripcion, mensaje);
      } else {
        console.log(`\n--- Push (modo desarrollo, no se envió) ---\nUsuario: ${usuarioId}\n${mensaje.titulo}: ${mensaje.cuerpo}\nURL: ${mensaje.url}\n---`);
      }
      resultado.enviadas++;
    } catch (error) {
      const status = statusDe(error);
      if (status !== undefined && ENDPOINT_CADUCADO.has(status)) {
        await prisma.suscripcionPush.deleteMany({ where: { id: suscripcion.id } });
        resultado.eliminadas++;
      } else {
        resultado.errores.push({ endpoint: suscripcion.endpoint, mensaje: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return resultado;
}
