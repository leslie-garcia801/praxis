import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { SuscribirInput } from './push.schemas.js';

// 503: the server works but this optional feature is not configured (no VAPID keys).
export function obtenerClavePublica(): string {
  if (!env.VAPID_PUBLIC_KEY) {
    throw new AppError(503, 'PUSH_NO_CONFIGURADO', 'Las notificaciones no están disponibles por ahora. Avisa a vinculación.');
  }
  return env.VAPID_PUBLIC_KEY;
}

// Upserts by endpoint and (re)assigns it to the user: the same browser may sign in as someone else.
export async function suscribir(usuarioId: string, { endpoint, keys }: SuscribirInput): Promise<{ id: string; creada: boolean }> {
  const datos = { usuarioId, p256dh: keys.p256dh, auth: keys.auth };
  const existente = await prisma.suscripcionPush.findUnique({ where: { endpoint }, select: { id: true } });
  if (existente) {
    await prisma.suscripcionPush.update({ where: { id: existente.id }, data: datos });
    return { id: existente.id, creada: false };
  }
  try {
    const { id } = await prisma.suscripcionPush.create({ data: { endpoint, ...datos }, select: { id: true } });
    return { id, creada: true };
  } catch (error) {
    // Lost a race with a concurrent request for the same endpoint: update instead.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      const { id } = await prisma.suscripcionPush.update({ where: { endpoint }, data: datos, select: { id: true } });
      return { id, creada: false };
    }
    throw error;
  }
}

// Idempotent: an unknown endpoint, or one that belongs to someone else, deletes nothing.
export async function darDeBaja(usuarioId: string, endpoint: string): Promise<void> {
  await prisma.suscripcionPush.deleteMany({ where: { endpoint, usuarioId } });
}
