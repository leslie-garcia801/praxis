import { ApiError, apiFetch } from '@/lib/api';

// Contract of /api/push (backend/src/modules/push, task 0045).

// GET /api/push/clave-publica. null = the server has no VAPID keys (503 PUSH_NO_CONFIGURADO): push is not available.
export async function fetchClavePublica(): Promise<string | null> {
  try {
    const { clavePublica } = await apiFetch<{ clavePublica: string }>('/api/push/clave-publica');
    return clavePublica;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'PUSH_NO_CONFIGURADO') return null;
    throw error;
  }
}

// POST /api/push/suscripciones with `subscription.toJSON()`. The server reassigns the endpoint to the current user.
export function guardarSuscripcion(subscription: PushSubscriptionJSON) {
  return apiFetch<{ suscripcion: { id: string } }>('/api/push/suscripciones', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}

// DELETE /api/push/suscripciones (idempotent, always 204).
export function eliminarSuscripcion(endpoint: string) {
  return apiFetch<void>('/api/push/suscripciones', { method: 'DELETE', body: JSON.stringify({ endpoint }) });
}

// The VAPID public key travels as base64url; `pushManager.subscribe` wants bytes.
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + padding).replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
