import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAvance, buildExpediente, buildFilaPanel, buildMe, buildPanel, buildSupervisor, carrerasEjemplo } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const EXPEDIENTE = '44444444-4444-4444-8444-444444444444';
const ALUMNO = '88888888-8888-4888-8888-888888888881';
const RUTA = `/vinculacion/expedientes/${EXPEDIENTE}`;

const expediente = buildExpediente({
  id: EXPEDIENTE,
  estado: 'EN_PROCESO',
  fechaInicio: '2026-09-01',
  departamento: 'Sistemas',
  institucion: { id: '33333333-3333-4333-8333-333333333333', nombre: 'Hospital Alfa' },
  supervisor: buildSupervisor({ correo: 'laura@example.com' }),
  faltantes: [],
  alumno: {
    id: ALUMNO,
    nombre: 'Ana',
    apellidoPaterno: 'López',
    apellidoMaterno: 'García',
    matricula: '25258000000001',
    carrera: 'Programación',
    semestre: 5,
    grupo: '5A',
    turno: 'MATUTINO',
  },
});

function mockStaff(rol: 'VINCULACION' | 'ADMIN' = 'VINCULACION') {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol, oficina: 'SERVICIO_SOCIAL' }))));
}

function mockDetalle() {
  server.use(
    http.get(`*/api/expedientes/${EXPEDIENTE}`, () => HttpResponse.json({ expediente })),
    http.get(`*/api/expedientes/${EXPEDIENTE}/avance`, () =>
      HttpResponse.json({ avance: buildAvance({ minutosValidados: 1500, minutosRegistrados: 1740, porcentaje: 5 }) }),
    ),
  );
}

// Serves the reset endpoint and counts the calls.
function mockRestablecer(respuesta: () => Response = () => HttpResponse.json({ passwordTemporal: 'Temporal-1234' })) {
  const llamadas: string[] = [];
  server.use(
    http.post('*/api/alumnos/:id/restablecer-contrasena', ({ params }) => {
      llamadas.push(String(params.id));
      return respuesta();
    }),
  );
  return llamadas;
}

describe('DetalleAlumnoPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a loading state, then the student, the case file and the progress', async () => {
    mockStaff();
    mockDetalle();
    renderApp(RUTA);

    expect(await screen.findByText(/cargando/i)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Ana López García' })).toBeInTheDocument();
    expect(screen.getByText('25258000000001')).toBeInTheDocument();
    expect(screen.getByText(/Programación/)).toBeInTheDocument();
    expect(screen.getByText('Hospital Alfa')).toBeInTheDocument();
    expect(screen.getByText(/laura@example.com/)).toBeInTheDocument();
    expect(screen.getByText('En proceso')).toBeInTheDocument();
    expect(await screen.findByText(/25 h/)).toBeInTheDocument(); // 1500 validated minutes
  });

  it('shows an error with retry when the case file cannot be loaded', async () => {
    mockStaff();
    let fallar = true;
    server.use(
      http.get(`*/api/expedientes/${EXPEDIENTE}`, () =>
        fallar
          ? HttpResponse.json({ error: { code: 'NO_ENCONTRADO', message: 'Expediente no encontrado.' } }, { status: 404 })
          : HttpResponse.json({ expediente }),
      ),
      http.get(`*/api/expedientes/${EXPEDIENTE}/avance`, () => HttpResponse.json({ avance: buildAvance() })),
    );
    const { user } = renderApp(RUTA);

    expect(await screen.findByText('Expediente no encontrado.')).toBeInTheDocument();
    fallar = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Ana López García' })).toBeInTheDocument();
  });

  it('RF-04: resets the password after confirming and shows the temporary one once', async () => {
    mockStaff();
    mockDetalle();
    const llamadas = mockRestablecer();
    const { user } = renderApp(RUTA);
    // After renderApp: userEvent.setup() installs its own clipboard stub.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await user.click(await screen.findByRole('button', { name: 'Restablecer contraseña' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText(/dejará de funcionar/)).toBeInTheDocument();
    await user.click(within(dialogo).getByRole('button', { name: 'Restablecer' }));

    expect(await screen.findByText('Temporal-1234')).toBeInTheDocument();
    expect(llamadas).toEqual([ALUMNO]);
    expect(screen.getByText(/no se volverá a mostrar/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(writeText).toHaveBeenCalledWith('Temporal-1234');
    expect(await screen.findByText('Copiada.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Listo' }));
    expect(screen.queryByText('Temporal-1234')).not.toBeInTheDocument();
  });

  it('RF-04: cancelling the confirmation does not call the API', async () => {
    mockStaff();
    mockDetalle();
    const llamadas = mockRestablecer();
    const { user } = renderApp(RUTA);

    await user.click(await screen.findByRole('button', { name: 'Restablecer contraseña' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(llamadas).toEqual([]);
  });

  it('RF-04: shows the API error inside the dialog and keeps it open', async () => {
    mockStaff();
    mockDetalle();
    mockRestablecer(() =>
      HttpResponse.json({ error: { code: 'NO_ENCONTRADO', message: 'Alumno no encontrado.' } }, { status: 404 }),
    );
    const { user } = renderApp(RUTA);

    await user.click(await screen.findByRole('button', { name: 'Restablecer contraseña' }));
    const dialogo = await screen.findByRole('alertdialog');
    await user.click(within(dialogo).getByRole('button', { name: 'Restablecer' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Alumno no encontrado.');
  });

  it('is available to the admin too', async () => {
    mockStaff('ADMIN');
    mockDetalle();
    renderApp(RUTA);

    expect(await screen.findByRole('button', { name: 'Restablecer contraseña' })).toBeInTheDocument();
  });

  it('opens from the student name in the panel', async () => {
    mockStaff();
    mockDetalle();
    server.use(
      http.get('*/api/carreras', () => HttpResponse.json({ carreras: carrerasEjemplo })),
      http.get('*/api/instituciones', () => HttpResponse.json({ instituciones: [] })),
      http.get('*/api/panel/alumnos', () =>
        HttpResponse.json(
          buildPanel({
            alumnos: [buildFilaPanel({ expediente: { ...buildFilaPanel().expediente, id: EXPEDIENTE } })],
          }),
        ),
      ),
    );
    const { user, router } = renderApp('/vinculacion');

    const enlace = await screen.findByRole('link', { name: buildFilaPanel().alumno.nombre });
    await user.click(enlace);

    await waitFor(() => expect(router.state.location.pathname).toBe(RUTA));
    expect(await screen.findByRole('heading', { name: 'Ana López García' })).toBeInTheDocument();
  });
});
