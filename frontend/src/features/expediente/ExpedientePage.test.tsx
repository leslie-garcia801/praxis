import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  buildExpediente,
  buildExpedienteActivo,
  buildInstitucion,
  buildMe,
  buildSupervisor,
} from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const EXP_ID = '44444444-4444-4444-8444-444444444444';
const ALFA = '33333333-3333-4333-8333-333333333333';
const BETA = '66666666-6666-4666-8666-666666666666';
const SUP_ALFA = '55555555-5555-4555-8555-555555555555';
const SUP_BETA = '77777777-7777-4777-8777-777777777777';

const alfa = buildInstitucion({ id: ALFA, nombre: 'Hospital Alfa', municipio: 'Guadalupe' });
const beta = buildInstitucion({ id: BETA, nombre: 'Clínica Beta', municipio: 'Monterrey' });

type Mocks = {
  expediente?: Record<string, unknown>;
  estadoActivo?: 'PENDIENTE' | 'EN_PROCESO' | 'SUSPENDIDO';
  tipo?: 'SERVICIO_SOCIAL' | 'PRACTICAS';
};

// Registers the handlers of a student with an active expediente and returns the captured requests.
function mockApi({ expediente = buildExpediente(), estadoActivo = 'PENDIENTE', tipo = 'SERVICIO_SOCIAL' }: Mocks = {}) {
  const captured = {
    patch: null as unknown,
    post: null as unknown,
    institucionesUrls: [] as URL[],
  };
  server.use(
    http.get('*/api/me', () =>
      HttpResponse.json(buildMe({ expedienteActivo: buildExpedienteActivo({ id: EXP_ID, tipo, estado: estadoActivo }) })),
    ),
    http.get('*/api/expedientes/:id', () => HttpResponse.json({ expediente })),
    http.patch('*/api/expedientes/:id', async ({ request }) => {
      captured.patch = await request.json();
      return HttpResponse.json({ expediente: buildExpediente({ ...expediente, faltantes: [] }) });
    }),
    http.get('*/api/instituciones', ({ request }) => {
      const url = new URL(request.url);
      captured.institucionesUrls.push(url);
      const q = url.searchParams.get('q')?.toLowerCase();
      const lista = [alfa, beta].filter((i) => !q || String(i.nombre).toLowerCase().includes(q));
      return HttpResponse.json({ instituciones: lista });
    }),
    http.get('*/api/instituciones/:id/supervisores', ({ params }) =>
      HttpResponse.json({
        supervisores:
          params.id === ALFA
            ? [buildSupervisor({ id: SUP_ALFA })]
            : [buildSupervisor({ id: SUP_BETA, institucionId: BETA, nombre: 'Pedro', apellidoPaterno: 'Salas', apellidoMaterno: null })],
      }),
    ),
    http.post('*/api/instituciones/:id/supervisores', async ({ request, params }) => {
      captured.post = await request.json();
      return HttpResponse.json(
        {
          supervisor: buildSupervisor({
            id: '88888888-8888-4888-8888-888888888888',
            institucionId: params.id,
            titulo: null,
            nombre: 'Rosa',
            apellidoPaterno: 'Vega',
            apellidoMaterno: null,
            puesto: null,
            departamento: null,
            confirmado: false,
          }),
        },
        { status: 201 },
      );
    }),
  );
  return captured;
}

const setDate = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('/alumno/expediente (RF-10)', () => {
  it('guarda un servicio social: institución, supervisor existente y fecha de inicio (RF-10)', async () => {
    const captured = mockApi();
    const { user } = renderApp('/alumno/expediente');

    await user.click(await screen.findByRole('radio', { name: /Hospital Alfa/ }));
    await user.click(await screen.findByRole('radio', { name: /Laura Mendoza/ }));
    setDate('Fecha de inicio', '2026-11-16');
    await user.click(screen.getByRole('button', { name: 'Guardar expediente' }));

    expect(await screen.findByText('Listo. Vinculación revisará tu expediente para confirmarlo')).toBeInTheDocument();
    expect(captured.patch).toEqual({
      institucionId: ALFA,
      supervisorId: SUP_ALFA,
      departamento: null,
      fechaInicio: '2026-11-16',
      programa: null,
      subprograma: null,
    });
    // The institution list is filtered by the expediente type.
    expect(captured.institucionesUrls[0]?.searchParams.get('tipo')).toBe('SERVICIO_SOCIAL');
  });

  it('el buscador filtra la lista de instituciones con q', async () => {
    const captured = mockApi();
    const { user } = renderApp('/alumno/expediente');

    await screen.findByRole('radio', { name: /Clínica Beta/ });
    await user.type(screen.getByLabelText('Buscar institución'), 'beta');

    await waitFor(() => expect(screen.queryByRole('radio', { name: /Hospital Alfa/ })).not.toBeInTheDocument());
    expect(screen.getByRole('radio', { name: /Clínica Beta/ })).toBeInTheDocument();
    expect(captured.institucionesUrls.some((u) => u.searchParams.get('q') === 'beta')).toBe(true);
    // Debounced: typing does not issue one request per keystroke.
    const consultas = captured.institucionesUrls.map((u) => u.searchParams.get('q')).filter(Boolean);
    expect(consultas).toEqual(['beta']);
  });

  it('prácticas: valida término posterior al inicio y entrada anterior a la salida (RN-06)', async () => {
    const captured = mockApi({
      tipo: 'PRACTICAS',
      expediente: buildExpediente({
        tipo: 'PRACTICAS',
        institucion: { id: ALFA, nombre: 'Hospital Alfa' },
        supervisor: buildSupervisor({ id: SUP_ALFA }),
        fechaInicio: '2026-11-16',
      }),
    });
    const { user } = renderApp('/alumno/expediente');

    await screen.findByLabelText('Fecha de término');
    setDate('Fecha de término', '2026-11-16');
    await user.click(screen.getByRole('checkbox', { name: 'Lunes' }));
    await user.click(screen.getByRole('checkbox', { name: 'Miércoles' }));
    await user.type(screen.getByLabelText('Hora de entrada'), '15:00');
    await user.type(screen.getByLabelText('Hora de salida'), '09:00');
    await user.click(screen.getByRole('button', { name: 'Guardar expediente' }));

    expect(await screen.findByText('La fecha de término debe ser posterior a la de inicio.')).toBeInTheDocument();
    expect(screen.getByText('La hora de entrada debe ser anterior a la de salida.')).toBeInTheDocument();
    expect(captured.patch).toBeNull();

    setDate('Fecha de término', '2027-03-01');
    fireEvent.change(screen.getByLabelText('Hora de entrada'), { target: { value: '08:00' } });
    fireEvent.change(screen.getByLabelText('Hora de salida'), { target: { value: '14:00' } });
    await user.click(screen.getByRole('button', { name: 'Guardar expediente' }));

    expect(await screen.findByText('Listo. Vinculación revisará tu expediente para confirmarlo')).toBeInTheDocument();
    // Only practicas fields: no programa/subprograma.
    expect(captured.patch).toEqual({
      institucionId: ALFA,
      supervisorId: SUP_ALFA,
      departamento: null,
      fechaInicio: '2026-11-16',
      fechaTermino: '2027-03-01',
      diasPactados: [1, 3],
      horaEntrada: '08:00',
      horaSalida: '14:00',
    });
  });

  it('prácticas: pide al menos un día pactado', async () => {
    const captured = mockApi({
      tipo: 'PRACTICAS',
      expediente: buildExpediente({ tipo: 'PRACTICAS', institucion: { id: ALFA, nombre: 'Hospital Alfa' } }),
    });
    const { user } = renderApp('/alumno/expediente');
    await screen.findByLabelText('Fecha de término');
    await user.click(screen.getByRole('button', { name: 'Guardar expediente' }));
    expect(await screen.findByText('Indica al menos un día.')).toBeInTheDocument();
    expect(captured.patch).toBeNull();
  });

  it('da de alta un supervisor nuevo: queda seleccionado y avisa que vinculación lo revisará (RF-09, RF-10)', async () => {
    const captured = mockApi();
    const { user } = renderApp('/alumno/expediente');

    await user.click(await screen.findByRole('radio', { name: /Hospital Alfa/ }));
    await user.click(await screen.findByRole('radio', { name: 'Mi supervisor no aparece' }));
    await user.type(screen.getByLabelText('Nombre'), 'Rosa');
    await user.type(screen.getByLabelText('Apellido paterno'), 'Vega');
    await user.type(screen.getByLabelText('Correo'), 'rosa@empresa.mx');
    await user.click(screen.getByRole('button', { name: 'Agregar supervisor' }));

    expect(await screen.findByText('Vinculación revisará los datos de tu supervisor')).toBeInTheDocument();
    expect(captured.post).toEqual({ nombre: 'Rosa', apellidoPaterno: 'Vega', correo: 'rosa@empresa.mx' });
    expect(screen.getByRole('radio', { name: /Rosa Vega/ })).toBeChecked();

    setDate('Fecha de inicio', '2026-11-16');
    await user.click(screen.getByRole('button', { name: 'Guardar expediente' }));
    await screen.findByText('Listo. Vinculación revisará tu expediente para confirmarlo');
    expect(captured.patch).toMatchObject({ supervisorId: '88888888-8888-4888-8888-888888888888' });
  });

  it('el alta de supervisor pide nombre, apellido paterno y correo válido', async () => {
    const captured = mockApi();
    const { user } = renderApp('/alumno/expediente');
    await user.click(await screen.findByRole('radio', { name: /Hospital Alfa/ }));
    await user.click(await screen.findByRole('radio', { name: 'Mi supervisor no aparece' }));
    await user.type(screen.getByLabelText('Correo'), 'no-es-correo');
    await user.click(screen.getByRole('button', { name: 'Agregar supervisor' }));
    expect(await screen.findByText('Escribe el nombre del supervisor.')).toBeInTheDocument();
    expect(screen.getByText('Escribe el apellido paterno del supervisor.')).toBeInTheDocument();
    expect(screen.getByText('El correo no es válido.')).toBeInTheDocument();
    expect(captured.post).toBeNull();
  });

  it('cambiar de institución limpia el supervisor elegido', async () => {
    const captured = mockApi({
      expediente: buildExpediente({
        institucion: { id: ALFA, nombre: 'Hospital Alfa' },
        supervisor: buildSupervisor({ id: SUP_ALFA }),
        fechaInicio: '2026-11-16',
      }),
    });
    const { user } = renderApp('/alumno/expediente');

    expect(await screen.findByRole('radio', { name: /Laura Mendoza/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Clínica Beta/ }));

    const pedro = await screen.findByRole('radio', { name: /Pedro Salas/ });
    expect(pedro).not.toBeChecked();
    expect(screen.queryByRole('radio', { name: /Laura Mendoza/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar expediente' }));
    await screen.findByText('Listo. Vinculación revisará tu expediente para confirmarlo');
    expect(captured.patch).toMatchObject({ institucionId: BETA, supervisorId: null });
  });

  it('muestra lo que falta con nombres en español cuando la respuesta trae faltantes', async () => {
    mockApi();
    server.use(
      http.patch('*/api/expedientes/:id', () =>
        HttpResponse.json({ expediente: buildExpediente({ faltantes: ['supervisorId', 'fechaInicio', 'campoRaro'] }) }),
      ),
    );
    const { user } = renderApp('/alumno/expediente');

    await user.click(await screen.findByRole('radio', { name: /Hospital Alfa/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar expediente' }));

    const status = await screen.findByRole('status');
    expect(within(status).getByText('Aún falta completar:')).toBeInTheDocument();
    expect(within(status).getByText('Supervisor')).toBeInTheDocument();
    expect(within(status).getByText('Fecha de inicio')).toBeInTheDocument();
    expect(within(status).getByText('campoRaro')).toBeInTheDocument();
    expect(screen.queryByText(/Listo\. Vinculación/)).not.toBeInTheDocument();
  });

  it('muestra el mensaje de la API cuando el guardado falla', async () => {
    mockApi();
    server.use(
      http.patch('*/api/expedientes/:id', () =>
        HttpResponse.json(
          { error: { code: 'SUPERVISOR_DE_OTRA_INSTITUCION', message: 'El supervisor no pertenece a la institución elegida.' } },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderApp('/alumno/expediente');

    await user.click(await screen.findByRole('radio', { name: /Hospital Alfa/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar expediente' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El supervisor no pertenece a la institución elegida.');
  });

  it('precarga lo ya guardado', async () => {
    mockApi({
      expediente: buildExpediente({
        departamento: 'Sistemas',
        fechaInicio: '2026-11-16',
        programa: 'Salud comunitaria',
        subprograma: 'Vacunación',
        institucion: { id: ALFA, nombre: 'Hospital Alfa' },
        supervisor: buildSupervisor({ id: SUP_ALFA }),
      }),
    });
    renderApp('/alumno/expediente');

    expect(await screen.findByRole('radio', { name: /Hospital Alfa/ })).toBeChecked();
    expect(await screen.findByRole('radio', { name: /Laura Mendoza/ })).toBeChecked();
    expect(screen.getByLabelText('Departamento (opcional)')).toHaveValue('Sistemas');
    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('2026-11-16');
    expect(screen.getByLabelText('Programa (opcional)')).toHaveValue('Salud comunitaria');
    expect(screen.getByLabelText('Subprograma (opcional)')).toHaveValue('Vacunación');
  });

  it('EN_PROCESO es de solo lectura con aviso de vinculación', async () => {
    mockApi({
      estadoActivo: 'EN_PROCESO',
      expediente: buildExpediente({
        estado: 'EN_PROCESO',
        departamento: 'Sistemas',
        fechaInicio: '2026-11-16',
        institucion: { id: ALFA, nombre: 'Hospital Alfa' },
        supervisor: buildSupervisor({ id: SUP_ALFA }),
        faltantes: [],
      }),
    });
    renderApp('/alumno/expediente');

    expect(await screen.findByText('Tu expediente ya fue confirmado; para cambios acude a vinculación')).toBeInTheDocument();
    expect(screen.getByText('Hospital Alfa')).toBeInTheDocument();
    expect(screen.getByText('Lic. Laura Mendoza Ruiz')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar expediente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('SUSPENDIDO es de solo lectura con su propio aviso', async () => {
    mockApi({ estadoActivo: 'SUSPENDIDO', expediente: buildExpediente({ estado: 'SUSPENDIDO', faltantes: [] }) });
    renderApp('/alumno/expediente');
    expect(await screen.findByText('Tu expediente está suspendido; para cambios acude a vinculación')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar expediente' })).not.toBeInTheDocument();
  });

  it('sin expediente activo avisa y no pide el expediente', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ expedienteActivo: null }))));
    renderApp('/alumno/expediente');
    expect(await screen.findByText('No tienes un expediente activo. Acude a vinculación.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/alumno');
  });

  it('muestra cargando y luego el formulario, con el botón Volver al inicio', async () => {
    mockApi();
    renderApp('/alumno/expediente');
    expect(await screen.findByText('Cargando tu expediente…')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Guardar expediente' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/alumno');
  });

  it('error al cargar el expediente: permite reintentar', async () => {
    mockApi();
    let intentos = 0;
    server.use(
      http.get('*/api/expedientes/:id', () => {
        intentos += 1;
        return intentos === 1
          ? HttpResponse.json({ error: { code: 'X', message: 'Falló' } }, { status: 500 })
          : HttpResponse.json({ expediente: buildExpediente() });
      }),
    );
    const { user } = renderApp('/alumno/expediente');
    expect(await screen.findByText('No se pudo cargar tu expediente.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Guardar expediente' })).toBeInTheDocument();
  });

  it('error al cargar instituciones: permite reintentar', async () => {
    mockApi();
    let intentos = 0;
    server.use(
      http.get('*/api/instituciones', () => {
        intentos += 1;
        return intentos === 1
          ? HttpResponse.json({ error: { code: 'X', message: 'Falló' } }, { status: 500 })
          : HttpResponse.json({ instituciones: [alfa] });
      }),
    );
    const { user } = renderApp('/alumno/expediente');
    expect(await screen.findByText('No se pudieron cargar las instituciones.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('radio', { name: /Hospital Alfa/ })).toBeInTheDocument();
  });

  it('sin instituciones muestra un mensaje vacío', async () => {
    mockApi();
    server.use(http.get('*/api/instituciones', () => HttpResponse.json({ instituciones: [] })));
    renderApp('/alumno/expediente');
    expect(await screen.findByText('No hay instituciones que coincidan.')).toBeInTheDocument();
  });

  it('error al cargar supervisores: permite reintentar', async () => {
    mockApi();
    let intentos = 0;
    server.use(
      http.get('*/api/instituciones/:id/supervisores', () => {
        intentos += 1;
        return intentos === 1
          ? HttpResponse.json({ error: { code: 'X', message: 'Falló' } }, { status: 500 })
          : HttpResponse.json({ supervisores: [buildSupervisor({ id: SUP_ALFA })] });
      }),
    );
    const { user } = renderApp('/alumno/expediente');
    await user.click(await screen.findByRole('radio', { name: /Hospital Alfa/ }));
    expect(await screen.findByText('No se pudieron cargar los supervisores.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('radio', { name: /Laura Mendoza/ })).toBeInTheDocument();
  });
});
