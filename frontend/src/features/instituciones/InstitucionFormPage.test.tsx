import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInstitucion, buildMe, carrerasEjemplo } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const ID = '33333333-3333-4333-8333-333333333333';
const [contabilidad, programacion] = carrerasEjemplo as [(typeof carrerasEjemplo)[0], (typeof carrerasEjemplo)[0]];

function mockStaff() {
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION' }))),
    http.get('*/api/carreras', () => HttpResponse.json({ carreras: carrerasEjemplo })),
    http.get('*/api/instituciones', () => HttpResponse.json({ instituciones: [] })),
  );
}

function apiError(code: string, message: string, status: number) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

describe('/vinculacion/instituciones/nueva (RF-05, RF-08)', () => {
  it('requires the vinculación or admin role', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'ALUMNO' }))));
    renderApp('/vinculacion/instituciones/nueva');
    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
  });

  it('shows a loading state while the carreras load', async () => {
    mockStaff();
    server.use(
      http.get('*/api/carreras', async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ carreras: carrerasEjemplo });
      }),
    );
    renderApp('/vinculacion/instituciones/nueva');
    expect(await screen.findByText('Cargando…')).toBeInTheDocument();
    expect(await screen.findByLabelText('Nombre de la institución')).toBeInTheDocument();
  });

  it('shows an error when the carreras cannot be loaded and retries', async () => {
    mockStaff();
    let calls = 0;
    server.use(
      http.get('*/api/carreras', () => {
        calls += 1;
        return calls === 1
          ? apiError('ERROR_INTERNO', 'Ocurrió un error inesperado.', 500)
          : HttpResponse.json({ carreras: carrerasEjemplo });
      }),
    );
    const { user } = renderApp('/vinculacion/instituciones/nueva');
    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error inesperado.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Nombre de la institución')).toBeInTheDocument();
  });

  it('shows the required-field messages without calling the API', async () => {
    mockStaff();
    let posted = false;
    server.use(
      http.post('*/api/instituciones', () => {
        posted = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const { user } = renderApp('/vinculacion/instituciones/nueva');
    await screen.findByLabelText('Nombre de la institución');
    await user.click(screen.getByRole('button', { name: 'Guardar institución' }));

    expect(await screen.findByText('Escribe el nombre de la institución.')).toBeInTheDocument();
    expect(screen.getByText('Escribe la calle.')).toBeInTheDocument();
    expect(screen.getByText('Escribe el municipio.')).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('validates the correo and the cupo format', async () => {
    mockStaff();
    const { user } = renderApp('/vinculacion/instituciones/nueva');
    await user.type(await screen.findByLabelText('Correo'), 'no-es-correo');
    await user.type(screen.getByLabelText('Cupo'), '-3');
    await user.click(screen.getByRole('button', { name: 'Guardar institución' }));
    expect(await screen.findByText('El correo no es válido.')).toBeInTheDocument();
    expect(screen.getByText('El cupo debe ser un número entero, sin negativos.')).toBeInTheDocument();
  });

  it('creates the institution with the form values and returns to the list', async () => {
    mockStaff();
    let body: Record<string, unknown> = {};
    server.use(
      http.post('*/api/instituciones', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ institucion: buildInstitucion() }, { status: 201 });
      }),
    );
    const { user } = renderApp('/vinculacion/instituciones/nueva');
    await user.type(await screen.findByLabelText('Nombre de la institución'), '  Hospital Alfa ');
    await user.type(screen.getByLabelText('Calle'), 'Av. Juárez');
    await user.type(screen.getByLabelText('Municipio'), 'Guadalupe');
    await user.type(screen.getByLabelText('Cupo'), '12');
    await user.click(screen.getByLabelText('Matutino'));
    await user.click(screen.getByLabelText('Programación'));
    await user.click(screen.getByRole('button', { name: 'Guardar institución' }));

    expect(await screen.findByRole('heading', { name: 'Instituciones' })).toBeInTheDocument();
    expect(body).toMatchObject({
      nombre: 'Hospital Alfa',
      calle: 'Av. Juárez',
      municipio: 'Guadalupe',
      estado: 'Nuevo León',
      rfc: null,
      cupo: 12,
      turnos: ['MATUTINO'],
      carreraIds: [programacion.id],
      aceptaServicio: true,
      aceptaPracticas: true,
      activa: true,
      esPlantel: false,
    });
  });

  it('sends an empty cupo as null (sin dato)', async () => {
    mockStaff();
    let body: Record<string, unknown> = {};
    server.use(
      http.post('*/api/instituciones', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ institucion: buildInstitucion() }, { status: 201 });
      }),
    );
    const { user } = renderApp('/vinculacion/instituciones/nueva');
    await user.type(await screen.findByLabelText('Nombre de la institución'), 'Hospital Alfa');
    await user.type(screen.getByLabelText('Calle'), 'Av. Juárez');
    await user.type(screen.getByLabelText('Municipio'), 'Guadalupe');
    await user.click(screen.getByRole('button', { name: 'Guardar institución' }));
    await screen.findByRole('heading', { name: 'Instituciones' });
    expect(body.cupo).toBeNull();
  });

  it('RF-08: shows a 409 RFC_DUPLICADO on the RFC field', async () => {
    mockStaff();
    server.use(
      http.post('*/api/instituciones', () =>
        apiError('RFC_DUPLICADO', 'Ya existe una institución con ese RFC.', 409),
      ),
    );
    const { user } = renderApp('/vinculacion/instituciones/nueva');
    await user.type(await screen.findByLabelText('Nombre de la institución'), 'Hospital Alfa');
    await user.type(screen.getByLabelText('Calle'), 'Av. Juárez');
    await user.type(screen.getByLabelText('Municipio'), 'Guadalupe');
    await user.type(screen.getByLabelText('RFC'), 'ABC010101XX1');
    await user.click(screen.getByRole('button', { name: 'Guardar institución' }));

    expect(await screen.findByText('Ya existe una institución con ese RFC.')).toBeInTheDocument();
    expect(screen.getByLabelText('RFC')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { name: 'Nueva institución' })).toBeInTheDocument();
  });

  it('shows other API errors in an alert', async () => {
    mockStaff();
    server.use(
      http.post('*/api/instituciones', () =>
        apiError('CARRERAS_INVALIDAS', 'Alguna de las carreras indicadas no existe.', 400),
      ),
    );
    const { user } = renderApp('/vinculacion/instituciones/nueva');
    await user.type(await screen.findByLabelText('Nombre de la institución'), 'Hospital Alfa');
    await user.type(screen.getByLabelText('Calle'), 'Av. Juárez');
    await user.type(screen.getByLabelText('Municipio'), 'Guadalupe');
    await user.click(screen.getByRole('button', { name: 'Guardar institución' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Alguna de las carreras indicadas no existe.');
  });

  it('does not offer the QR download before the institution exists', async () => {
    mockStaff();
    renderApp('/vinculacion/instituciones/nueva');
    await screen.findByLabelText('Nombre de la institución');
    expect(screen.queryByRole('button', { name: /Descargar QR/ })).not.toBeInTheDocument();
  });
});

describe('/vinculacion/instituciones/:id/editar (RF-08)', () => {
  const RUTA = `/vinculacion/instituciones/${ID}/editar`;
  const clicks: string[] = [];

  beforeEach(() => {
    clicks.length = 0;
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:fake', revokeObjectURL: () => undefined }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows a loading state', async () => {
    mockStaff();
    server.use(
      http.get(`*/api/instituciones/${ID}`, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ institucion: buildInstitucion() });
      }),
    );
    renderApp(RUTA);
    expect(await screen.findByText('Cargando…')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Hospital Alfa')).toBeInTheDocument();
  });

  it('shows the API error when the institution cannot be loaded', async () => {
    mockStaff();
    server.use(http.get(`*/api/instituciones/${ID}`, () => apiError('NO_ENCONTRADO', 'La institución no existe.', 404)));
    renderApp(RUTA);
    expect(await screen.findByRole('alert')).toHaveTextContent('La institución no existe.');
  });

  it('prefills the form, including carreras, turnos, cupo, and shows the codigo corto', async () => {
    mockStaff();
    server.use(http.get(`*/api/instituciones/${ID}`, () => HttpResponse.json({ institucion: buildInstitucion() })));
    renderApp(RUTA);

    expect(await screen.findByDisplayValue('Hospital Alfa')).toBeInTheDocument();
    expect(screen.getByLabelText('RFC')).toHaveValue('ABC010101XX1');
    expect(screen.getByLabelText('Cupo')).toHaveValue('5');
    expect(screen.getByLabelText('Matutino')).toBeChecked();
    expect(screen.getByLabelText('Vespertino')).not.toBeChecked();
    expect(screen.getByLabelText('Programación')).toBeChecked();
    expect(screen.getByLabelText('Contabilidad')).not.toBeChecked();
    expect(screen.getByLabelText('Activa')).toBeChecked();
    expect(screen.getByText('ABC234')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar QR de Hospital Alfa' })).toBeInTheDocument();
  });

  it('PATCHes the changes: marks inactive, clears the cupo and replaces the carreras', async () => {
    mockStaff();
    let body: Record<string, unknown> = {};
    server.use(
      http.get(`*/api/instituciones/${ID}`, () => HttpResponse.json({ institucion: buildInstitucion() })),
      http.patch(`*/api/instituciones/${ID}`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ institucion: buildInstitucion({ activa: false }) });
      }),
    );
    const { user } = renderApp(RUTA);
    await screen.findByDisplayValue('Hospital Alfa');
    await user.click(screen.getByLabelText('Activa'));
    await user.clear(screen.getByLabelText('Cupo'));
    await user.click(screen.getByLabelText('Contabilidad'));
    await user.clear(screen.getByLabelText('RFC'));
    await user.click(screen.getByRole('button', { name: 'Guardar institución' }));

    expect(await screen.findByRole('heading', { name: 'Instituciones' })).toBeInTheDocument();
    expect(body).toMatchObject({
      activa: false,
      cupo: null,
      rfc: null,
    });
    expect([...(body.carreraIds as string[])].sort()).toEqual([contabilidad.id, programacion.id].sort());
  });

  it('shows a 409 RFC_DUPLICADO on the RFC field when editing', async () => {
    mockStaff();
    server.use(
      http.get(`*/api/instituciones/${ID}`, () => HttpResponse.json({ institucion: buildInstitucion() })),
      http.patch(`*/api/instituciones/${ID}`, () => apiError('RFC_DUPLICADO', 'Ya existe una institución con ese RFC.', 409)),
    );
    const { user } = renderApp(RUTA);
    await screen.findByDisplayValue('Hospital Alfa');
    await user.click(screen.getByRole('button', { name: 'Guardar institución' }));
    expect(await screen.findByText('Ya existe una institución con ese RFC.')).toBeInTheDocument();
  });

  it('RF-13: downloads a new QR from the edit page and shows the new codigo corto', async () => {
    mockStaff();
    let codigo = 'ABC234';
    server.use(
      http.get(`*/api/instituciones/${ID}`, () => HttpResponse.json({ institucion: buildInstitucion({ codigoCorto: codigo }) })),
      http.post(`*/api/instituciones/${ID}/qr`, () => {
        codigo = 'NEW777';
        return new HttpResponse(new Blob(['%PDF']), {
          headers: { 'Content-Disposition': 'attachment; filename="qr-hospital-alfa.pdf"' },
        });
      }),
    );
    const { user } = renderApp(RUTA);
    await user.click(await screen.findByRole('button', { name: 'Descargar QR de Hospital Alfa' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Generar y descargar' }));
    expect(await screen.findByText('NEW777')).toBeInTheDocument();
    await waitFor(() => expect(clicks).toEqual(['qr-hospital-alfa.pdf']));
  });
});
