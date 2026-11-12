import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildEnlaceValidacion } from '../test/msw/handlers';
import { server } from '../test/msw/server';
import { renderApp } from '../test/utils';

describe('router', () => {
  it('redirects the root to the sign-in screen when there is no session', async () => {
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('renders the supervisor validation route with a token, without a session', async () => {
    server.use(http.get('*/api/validacion/abc123', () => HttpResponse.json({ enlace: buildEnlaceValidacion() })));
    renderApp('/validar/abc123');
    expect(await screen.findByRole('heading', { name: 'Hola, Laura Mendoza' })).toBeInTheDocument();
  });

  it('shows a not-found screen for unknown paths', async () => {
    renderApp('/no-existe');
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });
});
