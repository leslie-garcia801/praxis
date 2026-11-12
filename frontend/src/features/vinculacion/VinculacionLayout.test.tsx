import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

type Oficina = 'SERVICIO_SOCIAL' | 'PRACTICAS' | null;

function signedIn(rol: 'VINCULACION' | 'ADMIN', oficina?: Oficina) {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol, oficina }))));
}

describe('VinculacionLayout (RN-03b)', () => {
  it('shows the menu with the active link marked', async () => {
    signedIn('VINCULACION');
    renderApp('/vinculacion');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Panel' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Instituciones' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Importar alumnos' })).toHaveAttribute('href', '/vinculacion/importar/alumnos');
    expect(within(nav).getByRole('link', { name: 'Importar instituciones' })).toHaveAttribute(
      'href',
      '/vinculacion/importar/instituciones',
    );
  });

  it('marks Instituciones as active inside its subpages', async () => {
    signedIn('VINCULACION');
    renderApp('/vinculacion/instituciones/nueva');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Instituciones' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Panel' })).not.toHaveAttribute('aria-current');
  });

  it('RN-03b: only the admin sees the Usuarios link', async () => {
    signedIn('ADMIN');
    renderApp('/vinculacion');
    expect(await screen.findByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/vinculacion/usuarios/nuevo');
  });

  it('RN-03b: vinculación does not see the Usuarios link', async () => {
    signedIn('VINCULACION');
    renderApp('/vinculacion');
    await screen.findByRole('navigation', { name: 'Principal' });
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it.each([
    ['SERVICIO_SOCIAL', 'Servicio social'],
    ['PRACTICAS', 'Prácticas'],
    [null, 'Ambas oficinas'],
  ] as const)('shows the office indicator for %s', async (oficina, texto) => {
    signedIn('VINCULACION', oficina);
    renderApp('/vinculacion');
    expect(await screen.findByLabelText('Oficina')).toHaveTextContent(texto);
  });

  it('offers sign out', async () => {
    signedIn('VINCULACION');
    renderApp('/vinculacion');
    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('keeps the existing screens inside the layout, without their own "Volver al panel"', async () => {
    signedIn('VINCULACION');
    renderApp('/vinculacion/importar/alumnos');
    expect(await screen.findByRole('heading', { name: 'Importar alumnos' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Volver al panel' })).not.toBeInTheDocument();
  });

  it('folds the menu on small screens behind a toggle button', async () => {
    signedIn('VINCULACION');
    const { user } = renderApp('/vinculacion');
    const toggle = await screen.findByRole('button', { name: 'Menú' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
