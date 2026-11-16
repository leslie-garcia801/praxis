import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { installPush } from '../../../test/push';
import { renderApp } from '../../../test/utils';

function mockSession() {
  let signedIn = true;
  let signOutCalls = 0;
  server.use(
    http.get('*/api/me', () =>
      signedIn
        ? HttpResponse.json(buildMe({ rol: 'ALUMNO' }))
        : HttpResponse.json({ error: { code: 'NO_AUTENTICADO', message: 'Debes iniciar sesión.' } }, { status: 401 }),
    ),
    http.post('*/api/auth/sign-out', () => {
      signedIn = false;
      signOutCalls++;
      return HttpResponse.json({ success: true });
    }),
  );
  return { signOutCalls: () => signOutCalls };
}

describe('sign out (RF-03)', () => {
  it('RF-03: signs out, clears the cache and goes to /entrar', async () => {
    const session = mockSession();
    const { user, router, queryClient } = renderApp('/alumno');
    queryClient.setQueryData(['avance'], { horas: 10 });

    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
    expect(session.signOutCalls()).toBe(1);
    expect(queryClient.getQueryData(['avance'])).toBeUndefined();
    expect(queryClient.getQueryData(['me'])).toBeNull();
  });

  it('is available on the vinculación home', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION' }))));
    renderApp('/vinculacion');
    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('is available while a password change is pending', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ debeCambiar: true }))));
    renderApp('/cambiar-contrasena');
    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('keeps the session and tells the user when sign-out fails', async () => {
    server.use(
      http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'ALUMNO' }))),
      http.post('*/api/auth/sign-out', () => new HttpResponse('boom', { status: 500 })),
    );
    const { user, router } = renderApp('/alumno');

    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cerrar la sesión. Intenta de nuevo.');
    expect(router.state.location.pathname).toBe('/alumno');
  });
  it('RF-28: removes the device push subscription on the server and on the device before signing out', async () => {
    const push = installPush({ permission: 'granted', subscribed: true });
    const order: string[] = [];
    let deleted: unknown;
    server.use(
      http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'ALUMNO' }))),
      http.delete('*/api/push/suscripciones', async ({ request }) => {
        deleted = await request.json();
        order.push('delete');
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('*/api/auth/sign-out', () => {
        order.push('sign-out');
        return HttpResponse.json({ success: true });
      }),
    );
    const { user } = renderApp('/alumno');

    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(order).toEqual(['delete', 'sign-out']);
    expect(deleted).toEqual({ endpoint: push.endpoint });
    expect(push.subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('RF-28: still signs out when removing the push subscription fails', async () => {
    const push = installPush({ permission: 'granted', subscribed: true });
    server.use(
      http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'ALUMNO' }))),
      http.delete('*/api/push/suscripciones', () => new HttpResponse('boom', { status: 500 })),
      http.post('*/api/auth/sign-out', () => HttpResponse.json({ success: true })),
    );
    const { user, router } = renderApp('/alumno');

    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
    // The device is still unsubscribed locally so the next student does not get these reminders.
    expect(push.subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('RF-28: signs out without any push request when the device has no subscription', async () => {
    installPush({ permission: 'granted', subscribed: false });
    mockSession();
    const { user } = renderApp('/alumno');

    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });
});
