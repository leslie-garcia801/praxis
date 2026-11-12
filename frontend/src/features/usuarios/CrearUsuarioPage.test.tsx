import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const URL = '*/api/usuarios';
const PASSWORD = 'Tmp-Pass-12345';

function mockRol(rol: 'ADMIN' | 'VINCULACION') {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol }))));
}

function mockCreate(capture?: (body: unknown) => void) {
  server.use(
    http.post(URL, async ({ request }) => {
      const body = (await request.json()) as { nombre: string; email: string; oficina: string | null };
      capture?.(body);
      return HttpResponse.json(
        {
          usuario: { id: 'u-2', nombre: body.nombre, email: body.email, rol: 'VINCULACION', oficina: body.oficina },
          passwordTemporal: PASSWORD,
        },
        { status: 201 },
      );
    }),
  );
}

async function openForm() {
  mockRol('ADMIN');
  const ctx = renderApp('/vinculacion/usuarios/nuevo');
  await screen.findByRole('heading', { name: 'Crear usuario de oficina' });
  return ctx;
}

type User = Awaited<ReturnType<typeof openForm>>['user'];

async function fill(user: User, office?: string) {
  await user.type(screen.getByLabelText('Nombre'), 'Carlos Pérez');
  await user.type(screen.getByLabelText('Correo'), 'carlos@cbtis258.edu.mx');
  if (office) await user.click(screen.getByRole('radio', { name: office }));
}

const submit = (user: User) => user.click(screen.getByRole('button', { name: 'Crear usuario' }));

describe('/vinculacion/usuarios/nuevo', () => {
  it('shows the temporary password once with a copy button and the first sign-in notice (RF-04)', async () => {
    mockCreate();
    const { user } = await openForm();
    await fill(user, 'Oficina de Prácticas Profesionales');
    await submit(user);

    expect(await screen.findByText(PASSWORD)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeInTheDocument();
    expect(screen.getByText(/no se volverá a mostrar/i)).toBeInTheDocument();
    expect(screen.getByText('carlos@cbtis258.edu.mx')).toBeInTheDocument();
  });

  it('copies the password to the clipboard and reports a copy failure', async () => {
    mockCreate();
    const { user } = await openForm();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await fill(user, 'Oficina de Prácticas Profesionales');
    await submit(user);
    await user.click(await screen.findByRole('button', { name: 'Copiar' }));
    expect(writeText).toHaveBeenCalledWith(PASSWORD);
    expect(await screen.findByText('Copiada.')).toBeInTheDocument();

    writeText.mockRejectedValue(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(await screen.findByText(/No se pudo copiar/)).toBeInTheDocument();
  });

  it('validates name, email and office on the client', async () => {
    const { user } = await openForm();
    await submit(user);
    expect(await screen.findByText('Escribe el nombre.')).toBeInTheDocument();
    expect(screen.getByText('El correo no es válido.')).toBeInTheDocument();
    expect(screen.getByText('Elige una oficina.')).toBeInTheDocument();
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
  });

  it('RN-03b: "Ambas oficinas" sends oficina null', async () => {
    let sent: unknown;
    mockCreate((b) => (sent = b));
    const { user } = await openForm();
    await fill(user, 'Ambas oficinas');
    await submit(user);
    await screen.findByText(PASSWORD);
    expect(sent).toEqual({ nombre: 'Carlos Pérez', email: 'carlos@cbtis258.edu.mx', oficina: null });
  });

  it('RN-03b: a specific office sends its value', async () => {
    let sent: unknown;
    mockCreate((b) => (sent = b));
    const { user } = await openForm();
    await fill(user, 'Oficina de Servicio Social y Titulación');
    await submit(user);
    await screen.findByText(PASSWORD);
    expect(sent).toMatchObject({ oficina: 'SERVICIO_SOCIAL' });
  });

  it('shows CORREO_EN_USO under the Correo field', async () => {
    server.use(
      http.post(URL, () =>
        HttpResponse.json(
          { error: { code: 'CORREO_EN_USO', message: 'Ese correo ya está registrado en otra cuenta.' } },
          { status: 409 },
        ),
      ),
    );
    const { user } = await openForm();
    await fill(user, 'Oficina de Prácticas Profesionales');
    await submit(user);
    const message = await screen.findByText('Ese correo ya está registrado en otra cuenta.');
    expect(screen.getByLabelText('Correo')).toHaveAccessibleDescription(message.textContent ?? '');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows other API errors in an alert', async () => {
    server.use(
      http.post(URL, () =>
        HttpResponse.json({ error: { code: 'ERROR_INTERNO', message: 'Algo salió mal.' } }, { status: 500 }),
      ),
    );
    const { user } = await openForm();
    await fill(user, 'Oficina de Prácticas Profesionales');
    await submit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal.');
  });

  it('"Crear otro usuario" clears the password and resets the form', async () => {
    mockCreate();
    const { user, queryClient } = await openForm();
    await fill(user, 'Oficina de Prácticas Profesionales');
    await submit(user);
    await screen.findByText(PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Crear otro usuario' }));

    expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('');
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.state.data))).not.toContain(PASSWORD);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(PASSWORD);
  });
});

describe('access to the user creation screen (RN-03b)', () => {
  it('ADMIN sees the Usuarios link in the menu', async () => {
    mockRol('ADMIN');
    renderApp('/vinculacion');
    expect(await screen.findByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/vinculacion/usuarios/nuevo',
    );
  });

  it('VINCULACION does not see the link and is redirected away from the screen', async () => {
    mockRol('VINCULACION');
    const { router } = renderApp('/vinculacion');
    await screen.findByRole('link', { name: 'Importar alumnos' });
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();

    await router.navigate('/vinculacion/usuarios/nuevo');
    await waitFor(() => expect(router.state.location.pathname).toBe('/vinculacion'));
    expect(screen.queryByRole('heading', { name: 'Crear usuario de oficina' })).not.toBeInTheDocument();
  });
});
