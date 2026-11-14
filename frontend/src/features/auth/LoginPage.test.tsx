import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

type Hit = { endpoint: 'username' | 'email'; body: Record<string, unknown> };

function mockSignIn(hits: Hit[], respond: () => Response = () => HttpResponse.json({ token: 't', user: {} })) {
  server.use(
    http.post('*/api/auth/sign-in/username', async ({ request }) => {
      hits.push({ endpoint: 'username', body: (await request.json()) as Record<string, unknown> });
      return respond();
    }),
    http.post('*/api/auth/sign-in/email', async ({ request }) => {
      hits.push({ endpoint: 'email', body: (await request.json()) as Record<string, unknown> });
      return respond();
    }),
  );
}

async function fillAndSubmit(
  user: ReturnType<typeof renderApp>['user'],
  identifier: string,
  password = 'Secreta123',
) {
  await user.type(await screen.findByLabelText('Matrícula o correo'), identifier);
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('/entrar (RF-03)', () => {
  it('RF-03: a 14-digit value signs in by username and the student lands on /alumno', async () => {
    const hits: Hit[] = [];
    mockSignIn(hits);
    const { user, router } = renderApp('/entrar');
    await screen.findByLabelText('Matrícula o correo');
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'ALUMNO' }))));

    await fillAndSubmit(user, '  25319051769999 ');

    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
    expect(hits).toEqual([{ endpoint: 'username', body: { username: '25319051769999', password: 'Secreta123' } }]);
    expect(router.state.location.pathname).toBe('/alumno');
  });

  it('RF-03: any other value signs in by email and vinculación lands on /vinculacion', async () => {
    const hits: Hit[] = [];
    mockSignIn(hits);
    const { user } = renderApp('/entrar');
    await screen.findByLabelText('Matrícula o correo');
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION' }))));

    await fillAndSubmit(user, 'vinculacion@cbtis258.edu.mx');

    expect(await screen.findByRole('heading', { name: 'Panel de Servicio Social y Titulación' })).toBeInTheDocument();
    expect(hits).toEqual([
      { endpoint: 'email', body: { email: 'vinculacion@cbtis258.edu.mx', password: 'Secreta123' } },
    ]);
  });

  it('RF-03: a 13-digit number is treated as an email, not a matrícula', async () => {
    const hits: Hit[] = [];
    mockSignIn(hits, () => HttpResponse.json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'x' }, { status: 401 }));
    const { user } = renderApp('/entrar');

    await fillAndSubmit(user, '2531905176999');

    await waitFor(() => expect(hits).toHaveLength(1));
    expect(hits[0]?.endpoint).toBe('email');
  });

  it('RF-04: a user with a temporary password lands on /cambiar-contrasena', async () => {
    mockSignIn([]);
    const { user } = renderApp('/entrar');
    await screen.findByLabelText('Matrícula o correo');
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'ALUMNO', debeCambiar: true }))));

    await fillAndSubmit(user, '25319051769999');

    expect(await screen.findByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument();
  });

  it('RF-03: wrong credentials show a Spanish message', async () => {
    mockSignIn([], () =>
      HttpResponse.json({ code: 'INVALID_USERNAME_OR_PASSWORD', message: 'Invalid username or password' }, { status: 401 }),
    );
    const { user } = renderApp('/entrar');

    await fillAndSubmit(user, '25319051769999', 'incorrecta1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Matrícula, correo o contraseña incorrectos.');
  });

  it('RF-03: a deactivated account shows the CUENTA_INACTIVA message', async () => {
    mockSignIn([], () =>
      HttpResponse.json({ code: 'CUENTA_INACTIVA', message: 'Tu cuenta está desactivada. Acude a la Oficina de Prácticas Profesionales o a la de Servicio Social y Titulación.' }, { status: 403 }),
    );
    const { user } = renderApp('/entrar');

    await fillAndSubmit(user, '25319051769999');

    expect(await screen.findByRole('alert')).toHaveTextContent('Tu cuenta está desactivada. Acude a la Oficina de Prácticas Profesionales o a la de Servicio Social y Titulación.');
  });

  it('RNF-06: the rate limit (429) shows a wait message', async () => {
    mockSignIn([], () => HttpResponse.json({ message: 'Too many requests. Please try again later.' }, { status: 429 }));
    const { user } = renderApp('/entrar');

    await fillAndSubmit(user, '25319051769999');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos. Espera un minuto e intenta de nuevo.',
    );
  });

  it('shows a generic message for unexpected failures', async () => {
    mockSignIn([], () => new HttpResponse('boom', { status: 500 }));
    const { user } = renderApp('/entrar');

    await fillAndSubmit(user, '25319051769999');

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo iniciar sesión. Intenta de nuevo.');
  });

  it('RF-03: requires both fields before calling the server', async () => {
    const hits: Hit[] = [];
    mockSignIn(hits);
    const { user } = renderApp('/entrar');

    await user.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Escribe tu matrícula o correo.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument();
    expect(screen.getByLabelText('Matrícula o correo')).toHaveAttribute('aria-invalid', 'true');
    expect(hits).toHaveLength(0);
  });

  it('disables the submit button while the request is pending', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.post('*/api/auth/sign-in/username', async () => {
        await gate;
        return HttpResponse.json({ code: 'INVALID_USERNAME_OR_PASSWORD', message: 'x' }, { status: 401 });
      }),
    );
    const { user } = renderApp('/entrar');

    await fillAndSubmit(user, '25319051769999');

    await waitFor(() => expect(screen.getByRole('button', { name: /Entrando/ })).toBeDisabled());
    release();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('RF-02: links first-time students to /activar', async () => {
    const { user, router } = renderApp('/entrar');

    await user.click(await screen.findByRole('link', { name: /Activa tu cuenta/ }));

    expect(router.state.location.pathname).toBe('/activar');
    expect(await screen.findByRole('heading', { name: 'Activar cuenta' })).toBeInTheDocument();
  });

  it('uses the right autocomplete attributes', async () => {
    renderApp('/entrar');
    expect(await screen.findByLabelText('Matrícula o correo')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'current-password');
  });
});
