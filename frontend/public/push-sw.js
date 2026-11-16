// Push handling for the generated service worker (vite.config.ts: workbox.importScripts).
// Payload sent by the backend (RF-28): { titulo, cuerpo, url } with a relative url such as /alumno/registrar.

const DEFAULT_URL = '/alumno';

function readPayload(data) {
  if (!data) return {};
  try {
    return data.json();
  } catch {
    try {
      return { cuerpo: data.text() };
    } catch {
      return {};
    }
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event.data) || {};
  const titulo = typeof payload.titulo === 'string' && payload.titulo ? payload.titulo : 'Praxis';
  const cuerpo = typeof payload.cuerpo === 'string' ? payload.cuerpo : '';
  const url = typeof payload.url === 'string' && payload.url ? payload.url : DEFAULT_URL;

  event.waitUntil(self.registration.showNotification(titulo, { body: cuerpo, icon: '/icon.svg', data: { url } }));
});

// Only same-origin targets; anything else falls back to the student home.
function targetOf(notification) {
  const url = notification.data && notification.data.url;
  try {
    const target = new URL(typeof url === 'string' ? url : DEFAULT_URL, self.location.origin);
    if (target.origin === self.location.origin) return target.href;
  } catch {
    // Malformed url: use the home.
  }
  return new URL(DEFAULT_URL, self.location.origin).href;
}

async function openTarget(href) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (existing) {
    try {
      await existing.focus();
      await existing.navigate(href);
      return;
    } catch {
      // The window cannot be navigated (for example it is not controlled): open a new one.
    }
  }
  await self.clients.openWindow(href);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openTarget(targetOf(event.notification)));
});
