import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/utils';

describe('router', () => {
  it('redirects the root to the sign-in screen when there is no session', async () => {
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('renders the supervisor validation route with a token, without a session', async () => {
    renderApp('/validar/abc123');
    expect(await screen.findByRole('heading', { name: 'Validar semanas' })).toBeInTheDocument();
  });

  it('shows a not-found screen for unknown paths', async () => {
    renderApp('/no-existe');
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });
});
