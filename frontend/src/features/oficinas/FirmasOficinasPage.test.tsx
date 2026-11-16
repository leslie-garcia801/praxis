import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const URL = '*/api/oficinas/responsables';
const PATH = '/vinculacion/oficinas/firmas';
const SS = 'Oficina de Servicio Social y Titulación';
const PR = 'Oficina de Prácticas Profesionales';

type Entry = {
  oficina: 'SERVICIO_SOCIAL' | 'PRACTICAS';
  nombreOficina: string;
  nombre: string | null;
  cargo: string | null;
  actualizadoEn: string | null;
};

const ssVacia: Entry = { oficina: 'SERVICIO_SOCIAL', nombreOficina: SS, nombre: null, cargo: null, actualizadoEn: null };
const prGuardada: Entry = {
  oficina: 'PRACTICAS',
  nombreOficina: PR,
  nombre: 'Ing. Laura Pérez',
  cargo: 'Jefa de la Oficina de Prácticas Profesionales',
  actualizadoEn: '2026-11-10T18:00:00.000Z',
};

function mockRol(rol: 'ADMIN' | 'VINCULACION') {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol }))));
}

function mockList(entries: Entry[] = [ssVacia, prGuardada]) {
  server.use(http.get(URL, () => HttpResponse.json(entries)));
}

async function openPage() {
  mockRol('ADMIN');
  const ctx = renderApp(PATH);
  await screen.findByRole('heading', { name: 'Firmas de las oficinas' });
  await screen.findByRole('form', { name: PR });
  return ctx;
}

const formOf = (office: string) => screen.getByRole('form', { name: office });

describe('RF-27: pantalla "Firmas de las oficinas"', () => {
  it('RF-27: shows the loading state', async () => {
    mockRol('ADMIN');
    server.use(http.get(URL, () => new Promise(() => {})));
    renderApp(PATH);
    expect(await screen.findByRole('status')).toHaveTextContent('Cargando');
  });

  it('RF-27: shows the load error and retries', async () => {
    mockRol('ADMIN');
    let calls = 0;
    server.use(
      http.get(URL, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ error: { code: 'ERROR', message: 'Falló la carga.' } }, { status: 500 })
          : HttpResponse.json([ssVacia, prGuardada]);
      }),
    );
    const { user } = renderApp(PATH);
    expect(await screen.findByText('Falló la carga.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('form', { name: PR })).toBeInTheDocument();
  });

  it('RF-27: shows both offices with saved values and the hint for empty ones', async () => {
    mockList();
    await openPage();
    expect(
      screen.getByText('El nombre y el cargo aparecen en la firma del reporte PDF de horas de cada oficina.'),
    ).toBeInTheDocument();
    const ss = within(formOf(SS));
    expect(ss.getByLabelText('Nombre')).toHaveValue('');
    expect(ss.getByLabelText('Cargo')).toHaveValue('');
    expect(ss.getByText('Sin capturar')).toBeInTheDocument();
    expect(ss.queryByText(/Actualizado el/)).not.toBeInTheDocument();
    const pr = within(formOf(PR));
    expect(pr.getByLabelText('Nombre')).toHaveValue('Ing. Laura Pérez');
    expect(pr.getByLabelText('Cargo')).toHaveValue('Jefa de la Oficina de Prácticas Profesionales');
    expect(pr.queryByText('Sin capturar')).not.toBeInTheDocument();
    expect(pr.getByText(/Actualizado el .*noviembre/)).toBeInTheDocument();
  });

  it('RF-27: keeps Guardar disabled until something changes', async () => {
    mockList();
    const { user } = await openPage();
    const ss = within(formOf(SS));
    expect(ss.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await user.type(ss.getByLabelText('Nombre'), 'Ing. Ana');
    expect(ss.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });

  it('RF-27: asks for name and position', async () => {
    mockList();
    const { user } = await openPage();
    const ss = within(formOf(SS));
    await user.type(ss.getByLabelText('Nombre'), '   ');
    await user.click(ss.getByRole('button', { name: 'Guardar' }));
    expect(await ss.findByText('Escribe el nombre.')).toBeInTheDocument();
    expect(ss.getByText('Escribe el cargo.')).toBeInTheDocument();
  });

  it('RF-27: rejects more than 150 characters', async () => {
    mockList();
    const { user } = await openPage();
    const ss = within(formOf(SS));
    await user.type(ss.getByLabelText('Nombre'), 'a'.repeat(151));
    await user.type(ss.getByLabelText('Cargo'), 'b'.repeat(151));
    await user.click(ss.getByRole('button', { name: 'Guardar' }));
    expect(await ss.findByText('El nombre no puede tener más de 150 caracteres.')).toBeInTheDocument();
    expect(ss.getByText('El cargo no puede tener más de 150 caracteres.')).toBeInTheDocument();
  });

  it('RF-27, RF-29: saves to the right office with a trimmed body and shows "Guardado"', async () => {
    mockList();
    let received: { path: string; body: unknown } | null = null;
    server.use(
      http.put('*/api/oficinas/responsables/:oficina', async ({ request, params }) => {
        received = { path: String(params.oficina), body: await request.json() };
        return HttpResponse.json({
          ...ssVacia,
          nombre: 'Ing. Ana Ruiz',
          cargo: 'Jefa de Servicio Social',
          actualizadoEn: '2026-11-15T12:00:00.000Z',
        });
      }),
    );
    const { user } = await openPage();
    const ss = within(formOf(SS));
    await user.type(ss.getByLabelText('Nombre'), '  Ing. Ana Ruiz ');
    await user.type(ss.getByLabelText('Cargo'), 'Jefa de Servicio Social');
    await user.click(ss.getByRole('button', { name: 'Guardar' }));

    expect(await ss.findByText('Guardado')).toBeInTheDocument();
    expect(received).toEqual({
      path: 'SERVICIO_SOCIAL',
      body: { nombre: 'Ing. Ana Ruiz', cargo: 'Jefa de Servicio Social' },
    });
    expect(ss.queryByText('Sin capturar')).not.toBeInTheDocument();
    expect(ss.getByText(/Actualizado el/)).toBeInTheDocument();
    expect(ss.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('RF-27: shows the server message on a 400', async () => {
    mockList();
    server.use(
      http.put('*/api/oficinas/responsables/:oficina', () =>
        HttpResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos del servidor.' } }, { status: 400 }),
      ),
    );
    const { user } = await openPage();
    const ss = within(formOf(SS));
    await user.type(ss.getByLabelText('Nombre'), 'Ing. Ana');
    await user.type(ss.getByLabelText('Cargo'), 'Jefa');
    await user.click(ss.getByRole('button', { name: 'Guardar' }));
    expect(await ss.findByRole('alert')).toHaveTextContent('Datos inválidos del servidor.');
    expect(ss.queryByText('Guardado')).not.toBeInTheDocument();
  });

  it('RF-27: saving one office keeps the unsaved text of the other', async () => {
    mockList();
    server.use(
      http.put('*/api/oficinas/responsables/:oficina', () =>
        HttpResponse.json({ ...ssVacia, nombre: 'Ing. Ana', cargo: 'Jefa', actualizadoEn: '2026-11-15T12:00:00.000Z' }),
      ),
    );
    const { user } = await openPage();
    const pr = within(formOf(PR));
    await user.type(pr.getByLabelText('Nombre'), ' Jr.');
    const ss = within(formOf(SS));
    await user.type(ss.getByLabelText('Nombre'), 'Ing. Ana');
    await user.type(ss.getByLabelText('Cargo'), 'Jefa');
    await user.click(ss.getByRole('button', { name: 'Guardar' }));
    await ss.findByText('Guardado');
    expect(pr.getByLabelText('Nombre')).toHaveValue('Ing. Laura Pérez Jr.');
    expect(pr.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });
});

describe('access to the signatures screen (RN-03b)', () => {
  it('RN-03b: ADMIN sees the "Firmas de las oficinas" link in the menu', async () => {
    mockRol('ADMIN');
    mockList();
    renderApp('/vinculacion');
    expect(await screen.findByRole('link', { name: 'Firmas de las oficinas' })).toHaveAttribute('href', PATH);
  });

  it('RN-03b: VINCULACION does not see the link and is redirected away from the screen', async () => {
    mockRol('VINCULACION');
    const { router } = renderApp('/vinculacion');
    await screen.findByRole('link', { name: 'Importar alumnos' });
    expect(screen.queryByRole('link', { name: 'Firmas de las oficinas' })).not.toBeInTheDocument();

    await router.navigate(PATH);
    await waitFor(() => expect(router.state.location.pathname).toBe('/vinculacion'));
    expect(screen.queryByRole('heading', { name: 'Firmas de las oficinas' })).not.toBeInTheDocument();
  });
});
