import { describe, expect, it, vi } from 'vitest';
import source from '../../../public/push-sw.js?raw';

// Runs public/push-sw.js (imported by the generated service worker) against a fake service worker scope.
const ORIGIN = 'https://app.example.test';

type Listener = (event: Record<string, unknown>) => void;

type FakeClient = { url: string; focus: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn> };

function fakeClient(url: string, navigate?: () => Promise<unknown>): FakeClient {
  const client: FakeClient = {
    url,
    focus: vi.fn(async () => client),
    navigate: vi.fn(navigate ?? (async () => client)),
  };
  return client;
}

function loadWorker(windows: FakeClient[] = []) {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(async (_title: string, _options: unknown) => undefined);
  const openWindow = vi.fn(async () => null);
  const self = {
    location: { origin: ORIGIN },
    registration: { showNotification },
    clients: { matchAll: vi.fn(async () => windows), openWindow },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  new Function('self', source)(self);
  return { listeners, showNotification, openWindow, self };
}

function pushEvent(data: unknown) {
  const waits: Promise<unknown>[] = [];
  return {
    event: {
      data: data === null ? null : { json: () => JSON.parse(data as string), text: () => String(data) },
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    },
    done: () => Promise.all(waits),
  };
}

function clickEvent(data: unknown) {
  const waits: Promise<unknown>[] = [];
  const close = vi.fn();
  return {
    event: { notification: { close, data }, waitUntil: (promise: Promise<unknown>) => waits.push(promise) },
    close,
    done: () => Promise.all(waits),
  };
}

describe('push service worker (RF-28)', () => {
  it('RF-28: shows the notification with the title, body, icon and the url in its data', async () => {
    const { listeners, showNotification } = loadWorker();
    const { event, done } = pushEvent(JSON.stringify({ titulo: '¿Olvidaste registrar tu salida?', cuerpo: 'Tu turno sigue abierto.', url: '/alumno/registrar' }));

    listeners.get('push')?.(event);
    await done();

    expect(showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = showNotification.mock.calls[0] as unknown as [string, { body: string; icon: string; data: { url: string } }];
    expect(title).toBe('¿Olvidaste registrar tu salida?');
    expect(options.body).toBe('Tu turno sigue abierto.');
    expect(options.icon).toBe('/icon.svg');
    expect(options.data.url).toBe('/alumno/registrar');
  });

  it('RF-28: falls back to plain text when the payload is not JSON', async () => {
    const { listeners, showNotification } = loadWorker();
    const { event, done } = pushEvent('Escribe tu bitácora');

    listeners.get('push')?.(event);
    await done();

    const [title, options] = showNotification.mock.calls[0] as unknown as [string, { body: string; data: { url: string } }];
    expect(title).toBe('Praxis');
    expect(options.body).toBe('Escribe tu bitácora');
    expect(options.data.url).toBe('/alumno');
  });

  it('RF-28: still shows a notification when the push has no data', async () => {
    const { listeners, showNotification } = loadWorker();
    const { event, done } = pushEvent(null);

    listeners.get('push')?.(event);
    await done();

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification.mock.calls[0]?.[0]).toBe('Praxis');
  });

  it('RF-28: clicking closes the notification and opens the url when the app is not open', async () => {
    const { listeners, openWindow } = loadWorker([]);
    const { event, close, done } = clickEvent({ url: '/alumno/registrar' });

    listeners.get('notificationclick')?.(event);
    await done();

    expect(close).toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/alumno/registrar`);
  });

  it('RF-28: clicking focuses an open app window and navigates it to the url', async () => {
    const client = fakeClient(`${ORIGIN}/alumno`);
    const { listeners, openWindow } = loadWorker([client]);
    const { event, done } = clickEvent({ url: '/alumno/historial?semana=2026-11-09' });

    listeners.get('notificationclick')?.(event);
    await done();

    expect(client.focus).toHaveBeenCalled();
    expect(client.navigate).toHaveBeenCalledWith(`${ORIGIN}/alumno/historial?semana=2026-11-09`);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('RF-28: opens a new window when the open one cannot be navigated', async () => {
    const client = fakeClient(`${ORIGIN}/alumno`, async () => {
      throw new Error('not controlled');
    });
    const { listeners, openWindow } = loadWorker([client]);
    const { event, done } = clickEvent({ url: '/alumno/registrar' });

    listeners.get('notificationclick')?.(event);
    await done();

    expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/alumno/registrar`);
  });

  it('RF-28: ignores windows of other origins when looking for the app window', async () => {
    const foreign = fakeClient('https://other.example.test/page');
    const { listeners, openWindow } = loadWorker([foreign]);
    const { event, done } = clickEvent({ url: '/alumno' });

    listeners.get('notificationclick')?.(event);
    await done();

    expect(foreign.focus).not.toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/alumno`);
  });

  it('RF-28: never navigates to another origin; it opens the student home instead', async () => {
    const client = fakeClient(`${ORIGIN}/alumno`);
    const { listeners } = loadWorker([client]);
    const { event, done } = clickEvent({ url: 'https://evil.example.test/phish' });

    listeners.get('notificationclick')?.(event);
    await done();

    expect(client.navigate).toHaveBeenCalledWith(`${ORIGIN}/alumno`);
  });
});
