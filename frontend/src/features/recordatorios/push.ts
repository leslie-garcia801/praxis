import { eliminarSuscripcion, fetchClavePublica, guardarSuscripcion, urlBase64ToUint8Array } from './api';

// Browser side of the push reminders (RF-28). The only React-free place that touches
// navigator.serviceWorker, PushManager and Notification.

export type EstadoPush =
  | { tipo: 'no-disponible' } // no support, no service worker (dev) or server without VAPID keys: the card hides
  | { tipo: 'instalar' } // iPhone/iPad with the app not on the home screen
  | { tipo: 'bloqueado' } // permission denied
  | { tipo: 'inactivo'; clavePublica: string }
  | { tipo: 'activo'; clavePublica: string };

export const pushKeys = { all: ['push'] as const, estado: ['push', 'estado'] as const };

function esIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS asks for the desktop site and reports itself as a Mac.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function appInstalada(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true
  );
}

function soportaPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// There is no service worker in `pnpm dev`, and `serviceWorker.ready` would never resolve: ask for the registration instead.
async function registroActivo(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration();
}

export async function detectarEstado(): Promise<EstadoPush> {
  // iOS only exposes PushManager to installed apps, so this check has to come before the support check.
  if (esIos() && !appInstalada()) {
    return (await fetchClavePublica()) === null ? { tipo: 'no-disponible' } : { tipo: 'instalar' };
  }
  if (!soportaPush()) return { tipo: 'no-disponible' };
  const registro = await registroActivo();
  if (!registro) return { tipo: 'no-disponible' };
  const clavePublica = await fetchClavePublica();
  if (clavePublica === null) return { tipo: 'no-disponible' };

  if (Notification.permission === 'denied') return { tipo: 'bloqueado' };
  const suscripcion = await registro.pushManager.getSubscription();
  if (Notification.permission === 'granted' && suscripcion) return { tipo: 'activo', clavePublica };
  return { tipo: 'inactivo', clavePublica };
}

// Must run straight from the tap: iOS only shows the permission prompt after a user gesture.
// Returns the permission the user ended up with; only 'granted' subscribes.
export async function activarPush(clavePublica: string): Promise<NotificationPermission> {
  let permiso = Notification.permission;
  if (permiso === 'default') permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return permiso;

  const registro = await registroActivo();
  if (!registro) throw new Error('No hay service worker activo.');
  const existente = await registro.pushManager.getSubscription();
  const suscripcion =
    existente ??
    (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(clavePublica) }));
  try {
    await guardarSuscripcion(suscripcion.toJSON());
  } catch (error) {
    // Do not leave a device subscription the server does not know about: it would look "activated" on the next visit.
    if (!existente) await suscripcion.unsubscribe().catch(() => undefined);
    throw error;
  }
  return permiso;
}

// Server first: if it fails the device stays subscribed and the student can retry.
export async function desactivarPush(): Promise<void> {
  const suscripcion = await (await registroActivo())?.pushManager.getSubscription();
  if (!suscripcion) return;
  await eliminarSuscripcion(suscripcion.endpoint);
  await suscripcion.unsubscribe();
}

// Before signing out (shared phones): the next student must not get the previous student's reminders.
// Best effort and never throws. The device is unsubscribed even if the server call fails: the push service
// then answers 410 for that endpoint and the backend deletes it.
export async function darDeBajaEsteDispositivo(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const suscripcion = await (await registroActivo())?.pushManager.getSubscription();
    if (!suscripcion) return;
    await eliminarSuscripcion(suscripcion.endpoint).catch(() => undefined);
    await suscripcion.unsubscribe().catch(() => undefined);
  } catch {
    // Never block signing out.
  }
}
