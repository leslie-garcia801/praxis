import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { asIphone, installPush } from '../../../test/push';
import { server } from '../../../test/msw/server';
import { RecordatoriosCard } from './components/RecordatoriosCard';

const CLAVE_URL = '*/api/push/clave-publica';
const SUSCRIPCIONES_URL = '*/api/push/suscripciones';
// base64url of the bytes 1, 2, 3
const CLAVE = 'AQID';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function mockClave() {
  server.use(http.get(CLAVE_URL, () => HttpResponse.json({ clavePublica: CLAVE })));
}

function mockNoConfigurado() {
  server.use(
    http.get(CLAVE_URL, () =>
      HttpResponse.json({ error: { code: 'PUSH_NO_CONFIGURADO', message: 'Las notificaciones no están configuradas.' } }, { status: 503 }),
    ),
  );
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RecordatoriosCard />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup({ delay: null }) };
}

const heading = () => screen.queryByRole('heading', { name: 'Recordatorios' });

describe('RecordatoriosCard (RF-28)', () => {
  it('RF-28: is hidden when the browser has no service worker support', async () => {
    renderCard();
    await wait(20);
    expect(heading()).not.toBeInTheDocument();
  });

  it('RF-28: is hidden in development, where there is no service worker registration, and does not hang', async () => {
    const push = installPush({ registration: false });
    renderCard();
    await waitFor(() => expect(push.getRegistration).toHaveBeenCalled());
    await wait(20);
    expect(heading()).not.toBeInTheDocument();
  });

  it('RF-28: is hidden when the server has no VAPID keys (503 PUSH_NO_CONFIGURADO)', async () => {
    installPush();
    mockNoConfigurado();
    renderCard();
    await wait(50);
    expect(heading()).not.toBeInTheDocument();
  });

  it('RF-28: explains what the reminders are and offers to turn them on', async () => {
    installPush();
    mockClave();
    renderCard();
    expect(await screen.findByRole('heading', { name: 'Recordatorios' })).toBeInTheDocument();
    expect(screen.getByText('Te avisamos si olvidas registrar tu salida y el domingo para escribir tu bitácora.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activar recordatorios' })).toBeInTheDocument();
  });

  it('RF-28: asks for permission only when tapping the button, then subscribes with the VAPID key and saves it', async () => {
    const push = installPush({ permission: 'default', answer: 'granted' });
    mockClave();
    let body: unknown;
    server.use(
      http.post(SUSCRIPCIONES_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ suscripcion: { id: 's1' } }, { status: 201 });
      }),
    );
    const { user } = renderCard();

    const button = await screen.findByRole('button', { name: 'Activar recordatorios' });
    expect(push.requestPermission).not.toHaveBeenCalled();
    expect(push.subscribe).not.toHaveBeenCalled();

    await user.click(button);

    expect(await screen.findByText('Recordatorios activados')).toBeInTheDocument();
    expect(push.requestPermission).toHaveBeenCalledTimes(1);
    expect(push.subscribe).toHaveBeenCalledTimes(1);
    const options = push.subscribe.mock.calls[0]?.[0];
    expect(options?.userVisibleOnly).toBe(true);
    expect(Array.from(options?.applicationServerKey as Uint8Array)).toEqual([1, 2, 3]);
    expect(body).toEqual(push.subscription.toJSON());
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
  });

  it('RF-28: shows the blocked state when the user denies the permission prompt', async () => {
    const push = installPush({ permission: 'default', answer: 'denied' });
    mockClave();
    const { user } = renderCard();

    await user.click(await screen.findByRole('button', { name: 'Activar recordatorios' }));

    expect(await screen.findByText(/Bloqueaste las notificaciones/)).toBeInTheDocument();
    expect(push.subscribe).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Activar recordatorios' })).not.toBeInTheDocument();
  });

  it('RF-28: explains how to unblock when the permission was already denied', async () => {
    installPush({ permission: 'denied' });
    mockClave();
    renderCard();
    expect(await screen.findByText(/Bloqueaste las notificaciones de esta app/)).toBeInTheDocument();
    expect(screen.getByText(/ajustes del navegador o del teléfono/)).toBeInTheDocument();
  });

  it('RF-28: shows "Recordatorios activados" and "Desactivar" when permission is granted and the device is subscribed', async () => {
    installPush({ permission: 'granted', subscribed: true });
    mockClave();
    renderCard();
    expect(await screen.findByText('Recordatorios activados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
  });

  it('RF-28: offers to activate again, without asking permission, when granted but not subscribed', async () => {
    const push = installPush({ permission: 'granted', subscribed: false });
    mockClave();
    server.use(http.post(SUSCRIPCIONES_URL, () => HttpResponse.json({ suscripcion: { id: 's1' } }, { status: 201 })));
    const { user } = renderCard();

    await user.click(await screen.findByRole('button', { name: 'Activar recordatorios' }));

    expect(await screen.findByText('Recordatorios activados')).toBeInTheDocument();
    expect(push.requestPermission).not.toHaveBeenCalled();
    expect(push.subscribe).toHaveBeenCalledTimes(1);
  });

  it('RF-28: deactivating removes the subscription on the server and then on the device', async () => {
    const push = installPush({ permission: 'granted', subscribed: true });
    mockClave();
    let body: unknown;
    server.use(
      http.delete(SUSCRIPCIONES_URL, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderCard();

    await user.click(await screen.findByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByRole('button', { name: 'Activar recordatorios' })).toBeInTheDocument();
    expect(body).toEqual({ endpoint: push.endpoint });
    expect(push.subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('RF-28: keeps the device subscribed and shows an error with retry when the server fails to remove it', async () => {
    const push = installPush({ permission: 'granted', subscribed: true });
    mockClave();
    server.use(http.delete(SUSCRIPCIONES_URL, () => new HttpResponse('boom', { status: 500 })));
    const { user } = renderCard();

    await user.click(await screen.findByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron desactivar los recordatorios. Intenta de nuevo.');
    expect(push.subscription.unsubscribe).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('RF-28: shows an error with retry when saving the subscription fails, and retrying works', async () => {
    const push = installPush({ permission: 'default', answer: 'granted' });
    mockClave();
    let fail = true;
    server.use(
      http.post(SUSCRIPCIONES_URL, () =>
        fail ? new HttpResponse('boom', { status: 500 }) : HttpResponse.json({ suscripcion: { id: 's1' } }, { status: 201 }),
      ),
    );
    const { user } = renderCard();

    await user.click(await screen.findByRole('button', { name: 'Activar recordatorios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron activar los recordatorios. Intenta de nuevo.');

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Recordatorios activados')).toBeInTheDocument();
    expect(push.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('RF-28: shows an error with retry when the public key cannot be loaded', async () => {
    installPush();
    let fail = true;
    server.use(
      http.get(CLAVE_URL, () => (fail ? new HttpResponse('boom', { status: 500 }) : HttpResponse.json({ clavePublica: CLAVE }))),
    );
    const { user } = renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo revisar los recordatorios. Intenta de nuevo.');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Activar recordatorios' })).toBeInTheDocument();
  });

  it('RF-28: on iPhone without installing the app, shows how to install it instead of the button', async () => {
    asIphone({ installed: false });
    mockClave();
    renderCard();
    expect(
      await screen.findByText(
        'Para recibir recordatorios en iPhone, agrega la app a tu pantalla de inicio: toca Compartir y luego Agregar a inicio.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/iOS 16\.4/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar recordatorios' })).not.toBeInTheDocument();
  });

  it('RF-28: on iPhone the install instructions are hidden when the server has push turned off', async () => {
    asIphone({ installed: false });
    mockNoConfigurado();
    renderCard();
    await wait(50);
    expect(heading()).not.toBeInTheDocument();
  });

  it('RF-28: on iPhone with the app installed, shows the button', async () => {
    asIphone({ installed: true });
    installPush();
    mockClave();
    renderCard();
    expect(await screen.findByRole('button', { name: 'Activar recordatorios' })).toBeInTheDocument();
  });

  it('RF-28: the display-mode standalone query also counts as installed on iPhone', async () => {
    asIphone({ installed: false });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(display-mode: standalone)' }));
    installPush();
    mockClave();
    renderCard();
    expect(await screen.findByRole('button', { name: 'Activar recordatorios' })).toBeInTheDocument();
  });
});
