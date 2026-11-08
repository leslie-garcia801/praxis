import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './router';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

describe('router', () => {
  it('redirects the root to the sign-in screen', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('renders the supervisor validation route with a token', async () => {
    renderAt('/validar/abc123');
    expect(await screen.findByRole('heading', { name: 'Validar semanas' })).toBeInTheDocument();
  });

  it('shows a not-found screen for unknown paths', async () => {
    renderAt('/no-existe');
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });
});
