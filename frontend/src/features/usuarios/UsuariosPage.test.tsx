import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const RUTA = '/vinculacion/usuarios';
const PASSWORD = 'Tmp-Pass-98765';

type UsuarioFila = {
  id: string;
  nombre: string;
  email: string;
  rol: 'VINCULACION' | 'ADMIN';
  oficina: 'PRACTICAS' | 'SERVICIO_SOCIAL' | null;
  activo: boolean;
  debeCambiar: boolean;
  creadoEn: string;
};

function buildUsuario(overrides: Partial<UsuarioFila> = {}): UsuarioFila {
  return {
    id: 'u-2',
    nombre: 'Carlos Pérez',
    email: 'carlos@cbtis258.edu.mx',
    rol: 'VINCULACION',
    oficina: 'PRACTICAS',
    activo: true,
    debeCambiar: false,
    creadoEn: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

// The signed-in admin is "user-1" (buildMe).
const yo = buildUsuario({ id: 'user-1', nombre: 'Ana Admin', email: 'ana@cbtis258.edu.mx', rol: 'ADMIN', oficina: null });
const carlos = buildUsuario();
const ambas = buildUsuario({ id: 'u-3', nombre: 'Berta Ruiz', email: 'berta@cbtis258.edu.mx', oficina: null, debeCambiar: true });
const inactivo = buildUsuario({
  id: 'u-4',
  nombre: 'Dora Vega',
  email: 'dora@cbtis258.edu.mx',
  oficina: 'SERVICIO_SOCIAL',
  activo: false,
});

function mockRol(rol: 'ADMIN' | 'VINCULACION' = 'ADMIN') {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol }))));
}

function mockLista(usuarios: UsuarioFila[] = [yo, carlos, ambas, inactivo]) {
  server.use(http.get('*/api/usuarios', () => HttpResponse.json({ usuarios })));
}

// Serves PATCH /api/usuarios/:id applying the body to the matching row; captures the bodies.
function mockPatch(usuarios: UsuarioFila[]) {
  const cuerpos: unknown[] = [];
  server.use(
    http.patch('*/api/usuarios/:id', async ({ params, request }) => {
      const body = (await request.json()) as Partial<UsuarioFila>;
      cuerpos.push(body);
      const actual = usuarios.find((u) => u.id === params.id)!;
      return HttpResponse.json({ usuario: { ...actual, ...body } });
    }),
  );
  return cuerpos;
}

async function abrir() {
  mockRol();
  const ctx = renderApp(RUTA);
  await screen.findByRole('heading', { name: 'Usuarios' });
  return ctx;
}

const fila = (nombre: string) => screen.getByRole('row', { name: new RegExp(nombre), hidden: true });

describe('/vinculacion/usuarios', () => {
  afterEach(() => vi.restoreAllMocks());

  it('§4: shows a loading state and then the users', async () => {
    mockLista();
    mockRol();
    renderApp(RUTA);
    expect(await screen.findByText('Cargando usuarios…')).toBeInTheDocument();
    expect(await screen.findByText('Carlos Pérez')).toBeInTheDocument();
  });

  it('§4: shows the error with a retry button', async () => {
    let intentos = 0;
    server.use(
      http.get('*/api/usuarios', () => {
        intentos += 1;
        return intentos === 1
          ? HttpResponse.json({ error: { code: 'ERROR_INTERNO', message: 'Algo salió mal.' } }, { status: 500 })
          : HttpResponse.json({ usuarios: [carlos] });
      }),
    );
    mockRol();
    const { user } = renderApp(RUTA);
    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Carlos Pérez')).toBeInTheDocument();
  });

  it('§4: shows a friendly empty state', async () => {
    mockLista([]);
    await abrir();
    expect(await screen.findByText('Todavía no hay usuarios.')).toBeInTheDocument();
  });

  it('RN-03b: lists name, email, role, office labels, "(tú)" and state badges', async () => {
    mockLista();
    await abrir();
    await screen.findByText('Carlos Pérez');

    const propia = fila('Ana Admin');
    expect(within(propia).getByText('(tú)')).toBeInTheDocument();
    expect(within(propia).getByText('Administrador')).toBeInTheDocument();
    expect(within(propia).getByText('—')).toBeInTheDocument();

    const filaCarlos = fila('Carlos Pérez');
    expect(within(filaCarlos).getByText('carlos@cbtis258.edu.mx')).toBeInTheDocument();
    expect(within(filaCarlos).getByText('Vinculación')).toBeInTheDocument();
    expect(within(filaCarlos).getByText('Oficina de Prácticas Profesionales')).toBeInTheDocument();
    expect(within(filaCarlos).getByText('Activo')).toBeInTheDocument();
    expect(within(filaCarlos).queryByText('(tú)')).not.toBeInTheDocument();

    const filaBerta = fila('Berta Ruiz');
    expect(within(filaBerta).getByText('Ambas oficinas')).toBeInTheDocument();
    expect(within(filaBerta).getByText('Debe cambiar contraseña')).toBeInTheDocument();

    const filaDora = fila('Dora Vega');
    expect(within(filaDora).getByText('Desactivado')).toBeInTheDocument();
    expect(within(filaDora).getByText('Oficina de Servicio Social y Titulación')).toBeInTheDocument();
  });

  it('RF-04: "Nuevo usuario" links to the create screen', async () => {
    mockLista();
    await abrir();
    expect(screen.getByRole('link', { name: 'Nuevo usuario' })).toHaveAttribute('href', '/vinculacion/usuarios/nuevo');
  });

  it('RN-03b: edit sends nombre and oficina for a vinculación user and updates the row', async () => {
    const usuarios = [yo, carlos, ambas, inactivo];
    mockLista(usuarios);
    const cuerpos = mockPatch(usuarios);
    const { user } = await abrir();
    await user.click(await screen.findByRole('button', { name: 'Editar Carlos Pérez' }));

    const nombre = screen.getByLabelText('Nombre');
    await user.clear(nombre);
    await user.type(nombre, 'Carlos P. Ruiz');
    await user.selectOptions(screen.getByLabelText('Oficina'), 'Ambas oficinas');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(cuerpos).toEqual([{ nombre: 'Carlos P. Ruiz', oficina: null }]));
    expect(await screen.findByText('Carlos P. Ruiz')).toBeInTheDocument();
    expect(screen.queryByText('Carlos Pérez')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('RN-03b: editing an admin has no office field and sends only nombre', async () => {
    const usuarios = [yo, carlos];
    mockLista(usuarios);
    const cuerpos = mockPatch(usuarios);
    const { user } = await abrir();
    await user.click(await screen.findByRole('button', { name: 'Editar Ana Admin' }));

    expect(screen.queryByLabelText('Oficina')).not.toBeInTheDocument();
    const nombre = screen.getByLabelText('Nombre');
    await user.clear(nombre);
    await user.type(nombre, 'Ana Directora');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(cuerpos).toEqual([{ nombre: 'Ana Directora' }]));
    expect(await screen.findByText('Ana Directora')).toBeInTheDocument();
  });

  it('§4: edit validates the name before sending', async () => {
    const usuarios = [yo, carlos];
    mockLista(usuarios);
    const cuerpos = mockPatch(usuarios);
    const { user } = await abrir();
    await user.click(await screen.findByRole('button', { name: 'Editar Carlos Pérez' }));
    await user.clear(screen.getByLabelText('Nombre'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Escribe el nombre.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nombre'), 'x'.repeat(151));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('El nombre no puede tener más de 150 caracteres.')).toBeInTheDocument();
    expect(cuerpos).toHaveLength(0);
  });

  it('RF-29: deactivating asks first, sends activo false and shows the badge', async () => {
    const usuarios = [yo, carlos];
    mockLista(usuarios);
    const cuerpos = mockPatch(usuarios);
    const { user } = await abrir();
    await user.click(await screen.findByRole('button', { name: 'Desactivar Carlos Pérez' }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('No podrá iniciar sesión y se cerrarán sus sesiones abiertas.');
    expect(cuerpos).toHaveLength(0);
    await user.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(cuerpos).toEqual([{ activo: false }]));
    await waitFor(() => expect(within(fila('Carlos Pérez')).getByText('Desactivado')).toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivar Carlos Pérez' })).toBeInTheDocument();
  });

  it('RF-29: cancelling the confirmation sends nothing', async () => {
    const usuarios = [yo, carlos];
    mockLista(usuarios);
    const cuerpos = mockPatch(usuarios);
    const { user } = await abrir();
    await user.click(await screen.findByRole('button', { name: 'Desactivar Carlos Pérez' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(cuerpos).toHaveLength(0);
  });

  it('RF-29: reactivating sends activo true and shows the badge', async () => {
    const usuarios = [yo, inactivo];
    mockLista(usuarios);
    const cuerpos = mockPatch(usuarios);
    const { user } = await abrir();
    await user.click(await screen.findByRole('button', { name: 'Reactivar Dora Vega' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(cuerpos).toEqual([{ activo: true }]));
    await waitFor(() => expect(within(fila('Dora Vega')).getByText('Activo')).toBeInTheDocument());
  });

  it('RF-29: shows the ULTIMO_ADMIN message from the server', async () => {
    const otroAdmin = buildUsuario({ id: 'u-9', nombre: 'Luis Admin', rol: 'ADMIN', oficina: null });
    mockLista([yo, otroAdmin]);
    server.use(
      http.patch('*/api/usuarios/:id', () =>
        HttpResponse.json(
          { error: { code: 'ULTIMO_ADMIN', message: 'No puedes desactivar al último administrador activo.' } },
          { status: 409 },
        ),
      ),
    );
    const { user } = await abrir();
    await user.click(await screen.findByRole('button', { name: 'Desactivar Luis Admin' }));
    const dialogo = await screen.findByRole('alertdialog');
    await user.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'No puedes desactivar al último administrador activo.',
    );
    expect(within(fila('Luis Admin')).getByText('Activo')).toBeInTheDocument();
  });

  it('RF-29: the current admin cannot deactivate or reset themself, but can edit', async () => {
    mockLista();
    await abrir();
    await screen.findByText('Carlos Pérez');
    expect(screen.getByRole('button', { name: 'Editar Ana Admin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desactivar Ana Admin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restablecer contraseña de Ana Admin' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restablecer contraseña de Carlos Pérez' })).toBeInTheDocument();
  });

  it('RF-04: reset shows the temporary password once with a copy button and discards it on close', async () => {
    mockLista([yo, carlos]);
    const llamadas: string[] = [];
    server.use(
      http.post('*/api/usuarios/:id/restablecer-contrasena', ({ params }) => {
        llamadas.push(String(params.id));
        return HttpResponse.json({ passwordTemporal: PASSWORD });
      }),
    );
    const { user, queryClient } = await abrir();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Carlos Pérez' }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(llamadas).toHaveLength(0);
    await user.click(within(dialogo).getByRole('button', { name: 'Restablecer' }));

    expect(await screen.findByText(PASSWORD)).toBeInTheDocument();
    expect(screen.getByText(/Entrégala a la persona; deberá cambiarla al entrar\./)).toBeInTheDocument();
    expect(llamadas).toEqual(['u-2']);
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(writeText).toHaveBeenCalledWith(PASSWORD);

    await user.click(screen.getByRole('button', { name: 'Listo' }));
    await waitFor(() => expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument());
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.state.data))).not.toContain(PASSWORD);
    expect(JSON.stringify(queryClient.getMutationCache().getAll().map((m) => m.state.data))).not.toContain(PASSWORD);

    // Opening it again asks for confirmation again; the password is gone.
    await user.click(screen.getByRole('button', { name: 'Restablecer contraseña de Carlos Pérez' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument();
  });

  it('RF-04: reset errors are shown in the dialog', async () => {
    mockLista([yo, carlos]);
    server.use(
      http.post('*/api/usuarios/:id/restablecer-contrasena', () =>
        HttpResponse.json({ error: { code: 'ERROR_INTERNO', message: 'Algo salió mal.' } }, { status: 500 }),
      ),
    );
    const { user } = await abrir();
    await user.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Carlos Pérez' }));
    const dialogo = await screen.findByRole('alertdialog');
    await user.click(within(dialogo).getByRole('button', { name: 'Restablecer' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Algo salió mal.');
  });
});

describe('access to the users screen (RN-03b)', () => {
  it('ADMIN: the Usuarios menu link points to the list', async () => {
    mockRol('ADMIN');
    mockLista();
    renderApp('/vinculacion');
    expect(await screen.findByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/vinculacion/usuarios');
  });

  it('VINCULACION is redirected away from the list', async () => {
    mockRol('VINCULACION');
    mockLista();
    const { router } = renderApp('/vinculacion');
    await screen.findByRole('link', { name: 'Importar alumnos' });
    await router.navigate(RUTA);
    await waitFor(() => expect(router.state.location.pathname).toBe('/vinculacion'));
    expect(screen.queryByRole('heading', { name: 'Usuarios' })).not.toBeInTheDocument();
  });
});
