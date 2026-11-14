import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInstitucion, buildMe, buildSupervisor, carrerasEjemplo } from '../../../test/msw/handlers';
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

  it('does not offer supervisors before the institution exists', async () => {
    mockStaff();
    renderApp('/vinculacion/instituciones/nueva');
    await screen.findByLabelText('Nombre de la institución');
    expect(screen.queryByRole('region', { name: 'Supervisores' })).not.toBeInTheDocument();
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

  it('RF-09: lists the supervisors of the institution with their contact data', async () => {
    mockStaff();
    server.use(
      http.get(`*/api/instituciones/${ID}`, () => HttpResponse.json({ institucion: buildInstitucion() })),
      http.get(`*/api/instituciones/${ID}/supervisores`, () =>
        HttpResponse.json({
          supervisores: [
            buildSupervisor({ correo: 'laura@example.com', telefono: '8112345678' }),
            buildSupervisor({ id: 'sup-2', nombre: 'Pedro', apellidoPaterno: 'Salas', apellidoMaterno: null, titulo: null, confirmado: false }),
          ],
        }),
      ),
    );
    renderApp(RUTA);

    const seccion = within(await screen.findByRole('region', { name: 'Supervisores' }));
    expect(await seccion.findByText('Lic. Laura Mendoza Ruiz')).toBeInTheDocument();
    expect(seccion.getByText(/laura@example\.com/)).toBeInTheDocument();
    expect(seccion.getByText('Pedro Salas')).toBeInTheDocument();
    expect(seccion.getByText('Por confirmar')).toBeInTheDocument();
  });

  it('RF-09: the office adds a supervisor to the institution', async () => {
    mockStaff();
    let creados: Record<string, unknown>[] = [];
    server.use(
      http.get(`*/api/instituciones/${ID}`, () => HttpResponse.json({ institucion: buildInstitucion() })),
      http.get(`*/api/instituciones/${ID}/supervisores`, () =>
        HttpResponse.json({ supervisores: creados.map((c) => buildSupervisor({ ...c, id: 'sup-nuevo', titulo: null, apellidoMaterno: null })) }),
      ),
      http.post(`*/api/instituciones/${ID}/supervisores`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        creados = [...creados, body];
        return HttpResponse.json({ supervisor: buildSupervisor({ ...body, id: 'sup-nuevo' }) }, { status: 201 });
      }),
    );
    const { user } = renderApp(RUTA);

    const seccion = within(await screen.findByRole('region', { name: 'Supervisores' }));
    expect(await seccion.findByText('Aún no hay supervisores en esta institución.')).toBeInTheDocument();
    await user.click(seccion.getByRole('button', { name: 'Nuevo supervisor' }));
    const grupo = within(seccion.getByRole('group', { name: 'Datos del supervisor nuevo' }));
    await user.type(grupo.getByLabelText('Nombre'), 'Marta');
    await user.type(grupo.getByLabelText('Apellido paterno'), 'Reyes');
    await user.type(grupo.getByLabelText('Correo'), 'marta@example.com');
    await user.click(grupo.getByRole('button', { name: 'Agregar supervisor' }));

    expect(await seccion.findByText('Marta Reyes')).toBeInTheDocument();
    expect(creados[0]).toMatchObject({ nombre: 'Marta', apellidoPaterno: 'Reyes', correo: 'marta@example.com' });
    // The form closes once the supervisor is added.
    expect(seccion.queryByRole('group', { name: 'Datos del supervisor nuevo' })).not.toBeInTheDocument();
  });

  describe('RF-09: edit, deactivate and reactivate a supervisor', () => {
    // Serves the list from `lista` and applies every PATCH to it, like the API would.
    function mockSupervisores(lista: Record<string, unknown>[], rechazo?: { code: string; message: string }) {
      const patches: Record<string, unknown>[] = [];
      server.use(
        http.get(`*/api/instituciones/${ID}`, () => HttpResponse.json({ institucion: buildInstitucion() })),
        http.get(`*/api/instituciones/${ID}/supervisores`, () => HttpResponse.json({ supervisores: lista })),
        http.patch('*/api/supervisores/:id', async ({ request, params }) => {
          const body = (await request.json()) as Record<string, unknown>;
          patches.push(body);
          if (rechazo) return apiError(rechazo.code, rechazo.message, 409);
          const i = lista.findIndex((x) => x.id === params.id);
          lista[i] = { ...lista[i], ...body };
          return HttpResponse.json({ supervisor: lista[i] });
        }),
      );
      return patches;
    }

    it('edits the data of a supervisor and clears an optional field', async () => {
      mockStaff();
      const lista = [buildSupervisor({ puesto: 'Gerente', telefono: '8112345678', correo: 'laura@example.com', activo: true })];
      const patches = mockSupervisores(lista);
      const { user } = renderApp(RUTA);

      const seccion = within(await screen.findByRole('region', { name: 'Supervisores' }));
      await user.click(await seccion.findByRole('button', { name: 'Editar a Lic. Laura Mendoza Ruiz' }));
      const grupo = within(seccion.getByRole('group', { name: 'Editar supervisor' }));
      expect(grupo.getByLabelText('Nombre')).toHaveValue('Laura');
      expect(grupo.getByLabelText('Correo')).toHaveValue('laura@example.com');
      await user.clear(grupo.getByLabelText('Puesto (opcional)'));
      await user.type(grupo.getByLabelText('Puesto (opcional)'), 'Directora');
      await user.clear(grupo.getByLabelText('Teléfono (opcional)'));
      await user.click(grupo.getByRole('button', { name: 'Guardar cambios' }));

      expect(await seccion.findByText(/Directora/)).toBeInTheDocument();
      expect(patches[0]).toMatchObject({ nombre: 'Laura', apellidoPaterno: 'Mendoza', correo: 'laura@example.com', puesto: 'Directora', telefono: null });
      expect(seccion.queryByRole('group', { name: 'Editar supervisor' })).not.toBeInTheDocument();
    });

    it('shows the validation message and does not call the API when the correo is invalid', async () => {
      mockStaff();
      const patches = mockSupervisores([buildSupervisor({ activo: true })]);
      const { user } = renderApp(RUTA);

      const seccion = within(await screen.findByRole('region', { name: 'Supervisores' }));
      await user.click(await seccion.findByRole('button', { name: /^Editar a / }));
      const grupo = within(seccion.getByRole('group', { name: 'Editar supervisor' }));
      await user.clear(grupo.getByLabelText('Correo'));
      await user.type(grupo.getByLabelText('Correo'), 'no-es-correo');
      await user.click(grupo.getByRole('button', { name: 'Guardar cambios' }));

      expect(await grupo.findByText('El correo no es válido.')).toBeInTheDocument();
      expect(patches).toHaveLength(0);
    });

    it('cancels the edit without saving', async () => {
      mockStaff();
      const patches = mockSupervisores([buildSupervisor({ activo: true })]);
      const { user } = renderApp(RUTA);

      const seccion = within(await screen.findByRole('region', { name: 'Supervisores' }));
      await user.click(await seccion.findByRole('button', { name: /^Editar a / }));
      await user.click(seccion.getByRole('button', { name: 'Cancelar' }));

      expect(seccion.queryByRole('group', { name: 'Editar supervisor' })).not.toBeInTheDocument();
      expect(patches).toHaveLength(0);
    });

    it('deactivates a supervisor and then reactivates it', async () => {
      mockStaff();
      const patches = mockSupervisores([buildSupervisor({ activo: true })]);
      const { user } = renderApp(RUTA);

      const seccion = within(await screen.findByRole('region', { name: 'Supervisores' }));
      await user.click(await seccion.findByRole('button', { name: 'Desactivar a Lic. Laura Mendoza Ruiz' }));
      expect(await seccion.findByText('Inactivo')).toBeInTheDocument();
      expect(patches[0]).toEqual({ activo: false });

      await user.click(seccion.getByRole('button', { name: 'Reactivar a Lic. Laura Mendoza Ruiz' }));
      await waitFor(() => expect(seccion.queryByText('Inactivo')).not.toBeInTheDocument());
      expect(patches[1]).toEqual({ activo: true });
    });

    it('shows why a supervisor with active case files cannot be deactivated', async () => {
      mockStaff();
      mockSupervisores([buildSupervisor({ activo: true })], {
        code: 'SUPERVISOR_CON_EXPEDIENTES',
        message: 'Este supervisor tiene 2 expedientes activos. Cámbiales el supervisor antes de desactivarlo.',
      });
      const { user } = renderApp(RUTA);

      const seccion = within(await screen.findByRole('region', { name: 'Supervisores' }));
      await user.click(await seccion.findByRole('button', { name: /^Desactivar a / }));

      expect(await seccion.findByRole('alert')).toHaveTextContent('Este supervisor tiene 2 expedientes activos. Cámbiales el supervisor antes de desactivarlo.');
      expect(seccion.queryByText('Inactivo')).not.toBeInTheDocument();
      expect(seccion.getByRole('button', { name: /^Desactivar a / })).toBeInTheDocument();
    });
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
        return new HttpResponse(new TextEncoder().encode('%PDF'), {
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
