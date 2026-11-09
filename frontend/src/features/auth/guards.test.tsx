import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../test/msw/server';
import { buildMe } from '../../../test/msw/handlers';
import { renderApp } from '../../../test/utils';

function signedInAs(opts: Parameters<typeof buildMe>[0]) {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe(opts))));
}

describe('route guards (RF-03, RF-04, RN-03b)', () => {
  it('RF-03: sends a visitor without session from /alumno to /entrar', async () => {
    const { router } = renderApp('/alumno');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('RF-03: sends a visitor without session from /vinculacion to /entrar', async () => {
    const { router } = renderApp('/vinculacion');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('RF-03: lets a visitor reach /activar', async () => {
    renderApp('/activar');
    expect(await screen.findByRole('heading', { name: 'Activar cuenta' })).toBeInTheDocument();
  });

  it('shows a loading state while the session is being read, not the wrong page', async () => {
    signedInAs({ rol: 'ALUMNO' });
    renderApp('/entrar');
    expect(screen.getByRole('status')).toHaveTextContent('Cargando');
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
  });

  it('RF-03: a student on /entrar goes to /alumno', async () => {
    signedInAs({ rol: 'ALUMNO' });
    const { router } = renderApp('/entrar');
    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/alumno');
  });

  it('RF-03: a student on /activar goes to /alumno', async () => {
    signedInAs({ rol: 'ALUMNO' });
    const { router } = renderApp('/activar');
    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/alumno');
  });

  it('RF-03: the root goes to the home of the role', async () => {
    signedInAs({ rol: 'VINCULACION' });
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Panel de vinculación' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/vinculacion');
  });

  it('RF-03: an admin lands on /vinculacion', async () => {
    signedInAs({ rol: 'ADMIN' });
    const { router } = renderApp('/entrar');
    expect(await screen.findByRole('heading', { name: 'Panel de vinculación' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/vinculacion');
  });

  it('RN-03b: a student reaching /vinculacion is sent to /alumno', async () => {
    signedInAs({ rol: 'ALUMNO' });
    const { router } = renderApp('/vinculacion');
    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/alumno');
  });

  it('RN-03b: vinculación reaching /alumno is sent to /vinculacion', async () => {
    signedInAs({ rol: 'VINCULACION' });
    const { router } = renderApp('/alumno');
    expect(await screen.findByRole('heading', { name: 'Panel de vinculación' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/vinculacion');
  });

  it('RF-04: a pending password change forces /cambiar-contrasena from any area', async () => {
    signedInAs({ rol: 'ALUMNO', debeCambiar: true });
    const { router } = renderApp('/alumno');
    expect(await screen.findByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/cambiar-contrasena');
  });

  it('RF-04: a pending password change also redirects away from /entrar', async () => {
    signedInAs({ rol: 'VINCULACION', debeCambiar: true });
    const { router } = renderApp('/entrar');
    expect(await screen.findByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/cambiar-contrasena');
  });

  it('RF-04: without a pending change /cambiar-contrasena redirects home', async () => {
    signedInAs({ rol: 'ALUMNO' });
    const { router } = renderApp('/cambiar-contrasena');
    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/alumno');
  });

  it('RF-04: /cambiar-contrasena without session redirects to /entrar', async () => {
    const { router } = renderApp('/cambiar-contrasena');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('a deactivated account (403 CUENTA_INACTIVA from /api/me) is treated as signed out', async () => {
    server.use(
      http.get('*/api/me', () =>
        HttpResponse.json(
          { error: { code: 'CUENTA_INACTIVA', message: 'Tu cuenta está desactivada. Acude a vinculación.' } },
          { status: 403 },
        ),
      ),
    );
    const { router } = renderApp('/alumno');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('shows a retry option when /api/me fails with a server error', async () => {
    server.use(http.get('*/api/me', () => new HttpResponse('boom', { status: 500 })));
    renderApp('/alumno');
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
