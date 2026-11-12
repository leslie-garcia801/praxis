import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

type User = ReturnType<typeof renderApp>['user'];

const MATRICULA = '25319051769999';

function apiError(status: number, code: string, message = 'mensaje del servidor') {
  return HttpResponse.json({ error: { code, message } }, { status });
}

async function fillIdentity(user: User, matricula = MATRICULA) {
  await user.type(await screen.findByLabelText('Matrícula'), matricula);
  await user.type(screen.getByLabelText('Nombre'), 'Ana María');
  await user.type(screen.getByLabelText('Primer apellido'), 'López');
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
}

async function reachPasswordStep(user: User) {
  server.use(http.post('*/api/auth/activar/verificar', () => HttpResponse.json({ ok: true })));
  await fillIdentity(user);
  await screen.findByLabelText('Contraseña');
}

describe('/activar (RF-02, RNF-07)', () => {
  it('RF-02: step 1 asks for a numeric matrícula, name and first surname', async () => {
    renderApp('/activar');
    const matricula = await screen.findByLabelText('Matrícula');
    expect(matricula).toHaveAttribute('inputmode', 'numeric');
    expect(matricula).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
    expect(screen.getByLabelText('Primer apellido')).toBeInTheDocument();
  });

  it('RF-02: validates step 1 locally (14 digits, required names)', async () => {
    let called = false;
    server.use(
      http.post('*/api/auth/activar/verificar', () => {
        called = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { user } = renderApp('/activar');
    await user.type(await screen.findByLabelText('Matrícula'), '123');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText('La matrícula tiene 14 dígitos.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu nombre.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu primer apellido.')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('RF-02: shows the not-registered message for an unknown matrícula', async () => {
    server.use(http.post('*/api/auth/activar/verificar', () => apiError(404, 'MATRICULA_NO_REGISTRADA')));
    const { user } = renderApp('/activar');

    await fillIdentity(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /^Tu matrícula no está registrada; acude a la Oficina de Prácticas Profesionales o a la de Servicio Social y Titulación$/,
    );
  });

  it('RF-02: shows a clear message when the name does not match', async () => {
    server.use(http.post('*/api/auth/activar/verificar', () => apiError(400, 'NOMBRE_NO_COINCIDE')));
    const { user } = renderApp('/activar');

    await fillIdentity(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El nombre no coincide con el registrado. Revisa cómo lo escribiste o acude a la Oficina de Prácticas Profesionales o a la de Servicio Social y Titulación.',
    );
  });

  it('RF-02: an already activated account points to sign-in', async () => {
    server.use(http.post('*/api/auth/activar/verificar', () => apiError(409, 'CUENTA_YA_ACTIVADA')));
    const { user } = renderApp('/activar');

    await fillIdentity(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Tu cuenta ya está activada; inicia sesión.');
    expect(within(alert).getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute('href', '/entrar');
  });

  it('RF-02: a deactivated account shows the CUENTA_INACTIVA message', async () => {
    server.use(http.post('*/api/auth/activar/verificar', () => apiError(403, 'CUENTA_INACTIVA')));
    const { user } = renderApp('/activar');

    await fillIdentity(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Tu cuenta está desactivada. Acude a la Oficina de Prácticas Profesionales o a la de Servicio Social y Titulación.');
  });

  it('RNF-06: the rate limit (429) shows a wait message', async () => {
    server.use(http.post('*/api/auth/activar/verificar', () => apiError(429, 'DEMASIADOS_INTENTOS')));
    const { user } = renderApp('/activar');

    await fillIdentity(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos. Espera un minuto e intenta de nuevo.',
    );
  });

  it('RF-02: sends the trimmed identity to verificar and moves to step 2', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/auth/activar/verificar', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const { user } = renderApp('/activar');

    await fillIdentity(user);

    expect(await screen.findByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'new-password');
    expect(body).toEqual({ matricula: MATRICULA, nombre: 'Ana María', apellidoPaterno: 'López' });
  });

  it('RF-02: step 2 rejects a password shorter than 8 characters', async () => {
    const { user } = renderApp('/activar');
    await reachPasswordStep(user);

    await user.type(screen.getByLabelText('Contraseña'), 'corta');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'corta');
    await user.click(screen.getByLabelText('He leído el aviso de privacidad'));
    await user.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    expect(await screen.findByText('La contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument();
  });

  it('RF-02: step 2 rejects a confirmation that does not match', async () => {
    const { user } = renderApp('/activar');
    await reachPasswordStep(user);

    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Secreta124');
    await user.click(screen.getByLabelText('He leído el aviso de privacidad'));
    await user.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmar contraseña')).toHaveAttribute('aria-invalid', 'true');
  });

  it('RF-02: step 2 rejects an invalid optional email', async () => {
    const { user } = renderApp('/activar');
    await reachPasswordStep(user);

    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Secreta123');
    await user.type(screen.getByLabelText('Correo (opcional)'), 'no-es-correo');
    await user.click(screen.getByLabelText('He leído el aviso de privacidad'));
    await user.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    expect(await screen.findByText('El correo no es válido.')).toBeInTheDocument();
  });

  it('RNF-07: step 2 requires accepting the privacy notice', async () => {
    let called = false;
    server.use(
      http.post('*/api/auth/activar', () => {
        called = true;
        return HttpResponse.json({ ok: true }, { status: 201 });
      }),
    );
    const { user } = renderApp('/activar');
    await reachPasswordStep(user);

    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Secreta123');
    await user.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    expect(await screen.findByText('Debes aceptar el aviso de privacidad.')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('RNF-07: shows the provisional privacy notice and states which data is not collected', async () => {
    const { user } = renderApp('/activar');
    await reachPasswordStep(user);

    const notice = screen.getByRole('region', { name: 'Aviso de privacidad' });
    expect(notice).toHaveTextContent('Texto provisional pendiente de aprobación del plantel');
    expect(notice).toHaveTextContent('departamento de vinculación del CBTIS 258');
    expect(notice).toHaveTextContent('No se recaban CURP, edad, sexo, servicio médico ni número de afiliación');
  });

  it('RF-02: activates, signs in by username with the new password and goes to /alumno', async () => {
    let activarBody: unknown;
    let signInBody: unknown;
    server.use(
      http.post('*/api/auth/activar', async ({ request }) => {
        activarBody = await request.json();
        return HttpResponse.json({ ok: true }, { status: 201 });
      }),
      http.post('*/api/auth/sign-in/username', async ({ request }) => {
        signInBody = await request.json();
        return HttpResponse.json({ token: 't', user: {} });
      }),
    );
    const { user, router } = renderApp('/activar');
    await reachPasswordStep(user);
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'ALUMNO' }))));

    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Secreta123');
    await user.click(screen.getByLabelText('He leído el aviso de privacidad'));
    await user.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/alumno');
    // An empty optional email is not sent.
    expect(activarBody).toEqual({
      matricula: MATRICULA,
      nombre: 'Ana María',
      apellidoPaterno: 'López',
      password: 'Secreta123',
    });
    expect(signInBody).toEqual({ username: MATRICULA, password: 'Secreta123' });
  });

  it('RF-02: sends the optional email when given', async () => {
    let activarBody: Record<string, unknown> = {};
    server.use(
      http.post('*/api/auth/activar', async ({ request }) => {
        activarBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true }, { status: 201 });
      }),
      http.post('*/api/auth/sign-in/username', () => HttpResponse.json({ token: 't', user: {} })),
    );
    const { user } = renderApp('/activar');
    await reachPasswordStep(user);

    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Secreta123');
    await user.type(screen.getByLabelText('Correo (opcional)'), 'ana@example.com');
    await user.click(screen.getByLabelText('He leído el aviso de privacidad'));
    await user.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    await waitFor(() => expect(activarBody.email).toBe('ana@example.com'));
  });

  it('RF-02: shows the server message when the email is already in use', async () => {
    server.use(
      http.post('*/api/auth/activar', () => apiError(409, 'CORREO_EN_USO')),
    );
    const { user } = renderApp('/activar');
    await reachPasswordStep(user);

    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Secreta123');
    await user.type(screen.getByLabelText('Correo (opcional)'), 'ana@example.com');
    await user.click(screen.getByLabelText('He leído el aviso de privacidad'));
    await user.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ese correo ya está registrado en otra cuenta.');
  });

  it('RF-02: if the automatic sign-in fails after activating, tells the student to sign in', async () => {
    server.use(
      http.post('*/api/auth/activar', () => HttpResponse.json({ ok: true }, { status: 201 })),
      http.post('*/api/auth/sign-in/username', () => new HttpResponse('boom', { status: 500 })),
    );
    const { user } = renderApp('/activar');
    await reachPasswordStep(user);

    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Secreta123');
    await user.click(screen.getByLabelText('He leído el aviso de privacidad'));
    await user.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Tu cuenta quedó activada, pero no se pudo iniciar sesión.');
    expect(within(alert).getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute('href', '/entrar');
  });

  it('RF-02: step 2 lets the student go back to fix the identity', async () => {
    const { user } = renderApp('/activar');
    await reachPasswordStep(user);

    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect(await screen.findByLabelText('Matrícula')).toHaveValue(MATRICULA);
  });
});
