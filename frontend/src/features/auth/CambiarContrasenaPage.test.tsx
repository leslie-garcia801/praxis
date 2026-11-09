import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

type User = ReturnType<typeof renderApp>['user'];

// The session starts with a pending change; after the change /api/me reports debeCambiar = false.
function mockPendingChange(rol: 'ALUMNO' | 'VINCULACION' = 'ALUMNO') {
  let changed = false;
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ rol, debeCambiar: !changed }))),
  );
  return {
    markChanged: () => {
      changed = true;
    },
  };
}

async function fill(user: User, actual: string, nueva: string, confirmar = nueva) {
  await user.type(await screen.findByLabelText('Contraseña actual'), actual);
  await user.type(screen.getByLabelText('Contraseña nueva'), nueva);
  await user.type(screen.getByLabelText('Confirmar contraseña nueva'), confirmar);
  await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
}

describe('/cambiar-contrasena (RF-04)', () => {
  it('RF-04: changes the temporary password and goes home by role', async () => {
    const state = mockPendingChange('ALUMNO');
    let body: unknown;
    server.use(
      http.post('*/api/me/cambiar-contrasena', async ({ request }) => {
        body = await request.json();
        state.markChanged();
        return HttpResponse.json({ ok: true });
      }),
    );
    const { user, router } = renderApp('/cambiar-contrasena');

    await fill(user, 'Temporal123', 'NuevaClave456');

    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/alumno');
    expect(body).toEqual({ passwordActual: 'Temporal123', passwordNueva: 'NuevaClave456' });
  });

  it('RF-04: vinculación goes to /vinculacion after the change', async () => {
    const state = mockPendingChange('VINCULACION');
    server.use(
      http.post('*/api/me/cambiar-contrasena', () => {
        state.markChanged();
        return HttpResponse.json({ ok: true });
      }),
    );
    const { user } = renderApp('/cambiar-contrasena');

    await fill(user, 'Temporal123', 'NuevaClave456');

    expect(await screen.findByRole('heading', { name: 'Panel de vinculación' })).toBeInTheDocument();
  });

  it('RF-04: a wrong current password is reported on that field', async () => {
    mockPendingChange();
    server.use(
      http.post('*/api/me/cambiar-contrasena', () =>
        HttpResponse.json(
          { error: { code: 'CONTRASENA_ACTUAL_INCORRECTA', message: 'La contraseña actual no es correcta.' } },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderApp('/cambiar-contrasena');

    await fill(user, 'Equivocada1', 'NuevaClave456');

    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña actual')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument();
  });

  it('RF-04: rejects a short new password without calling the server', async () => {
    mockPendingChange();
    let called = false;
    server.use(
      http.post('*/api/me/cambiar-contrasena', () => {
        called = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { user } = renderApp('/cambiar-contrasena');

    await fill(user, 'Temporal123', 'corta');

    expect(await screen.findByText('La contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('RF-04: rejects a confirmation that does not match', async () => {
    mockPendingChange();
    const { user } = renderApp('/cambiar-contrasena');

    await fill(user, 'Temporal123', 'NuevaClave456', 'OtraClave789');

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
  });

  it('RF-04: rejects a new password equal to the current one', async () => {
    mockPendingChange();
    const { user } = renderApp('/cambiar-contrasena');

    await fill(user, 'Temporal123', 'Temporal123');

    expect(await screen.findByText('La contraseña nueva debe ser distinta de la actual.')).toBeInTheDocument();
  });

  it('shows a generic message when the server fails', async () => {
    mockPendingChange();
    server.use(http.post('*/api/me/cambiar-contrasena', () => new HttpResponse('boom', { status: 500 })));
    const { user } = renderApp('/cambiar-contrasena');

    await fill(user, 'Temporal123', 'NuevaClave456');

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar la solicitud. Intenta de nuevo.');
  });

  it('uses the right autocomplete attributes', async () => {
    mockPendingChange();
    renderApp('/cambiar-contrasena');
    expect(await screen.findByLabelText('Contraseña actual')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirmar contraseña nueva')).toHaveAttribute('autocomplete', 'new-password');
  });
});
