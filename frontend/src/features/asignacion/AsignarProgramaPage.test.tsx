import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const RUTA = '/vinculacion/asignar';

function candidato(overrides: Record<string, unknown> = {}) {
  return {
    alumnoId: 'alumno-1',
    nombre: 'Ana María López García',
    matricula: '25319051761111',
    carrera: 'Programación',
    semestre: 6,
    grupo: 'A',
    turno: 'MATUTINO',
    programaTerminado: 'SERVICIO_SOCIAL',
    terminadoEn: '2026-11-16',
    tipoAsignable: 'PRACTICAS',
    ...overrides,
  };
}

const ANA = candidato();
const LUIS = candidato({
  alumnoId: 'alumno-2',
  nombre: 'Luis Pérez Soto',
  matricula: '25319051762222',
  carrera: 'Contabilidad',
  grupo: 'B',
  programaTerminado: 'PRACTICAS',
  terminadoEn: null,
  tipoAsignable: 'SERVICIO_SOCIAL',
});

function signedIn(rol: 'VINCULACION' | 'ADMIN' | 'ALUMNO' = 'VINCULACION') {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol, oficina: rol === 'VINCULACION' ? 'PRACTICAS' : null }))));
}

// The candidates list answers from a mutable array so a refresh after assigning shows the new state.
function mockCandidatos(lista: unknown[]) {
  const estado = { lista };
  server.use(http.get('*/api/expedientes/candidatos', () => HttpResponse.json({ candidatos: estado.lista })));
  return estado;
}

describe('/vinculacion/asignar states (RF-01, RN-03a)', () => {
  it('RF-01: shows the loading state', async () => {
    signedIn();
    server.use(http.get('*/api/expedientes/candidatos', () => new Promise(() => {})));
    renderApp(RUTA);
    expect(await screen.findByText('Cargando alumnos…')).toBeInTheDocument();
  });

  it('RF-01: shows the error with a retry that loads the list', async () => {
    signedIn();
    let intento = 0;
    server.use(
      http.get('*/api/expedientes/candidatos', () => {
        intento += 1;
        return intento === 1
          ? HttpResponse.json({ error: { code: 'ERROR', message: 'No se pudo cargar la lista.' } }, { status: 500 })
          : HttpResponse.json({ candidatos: [ANA] });
      }),
    );
    const { user } = renderApp(RUTA);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la lista.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana María López García')).toBeInTheDocument();
  });

  it('RF-01: shows the empty state', async () => {
    signedIn();
    mockCandidatos([]);
    renderApp(RUTA);
    expect(await screen.findByText('No hay alumnos listos para asignar.')).toBeInTheDocument();
  });

  it('RF-01: shows the title and the explanation', async () => {
    signedIn();
    mockCandidatos([ANA]);
    renderApp(RUTA);
    expect(await screen.findByRole('heading', { level: 1, name: 'Asignar el siguiente programa' })).toBeInTheDocument();
    expect(
      screen.getByText('Alumnos que ya terminaron su primer programa y pueden empezar el que le toca a tu oficina.'),
    ).toBeInTheDocument();
  });

  it('RN-03a: renders the labels of the finished program, the date and the program to assign', async () => {
    signedIn();
    mockCandidatos([ANA, LUIS]);
    renderApp(RUTA);

    const filaAna = (await screen.findByText('Ana María López García')).closest('tr') as HTMLElement;
    const ana = within(filaAna);
    expect(ana.getByText('25319051761111')).toBeInTheDocument();
    expect(ana.getByText('Programación')).toBeInTheDocument();
    expect(ana.getByText('6.º · A')).toBeInTheDocument();
    expect(ana.getByText('Servicio social · 16 de noviembre de 2026')).toBeInTheDocument();
    expect(ana.getByText('Prácticas profesionales')).toBeInTheDocument();

    const luis = within(screen.getByText('Luis Pérez Soto').closest('tr') as HTMLElement);
    expect(luis.getByText('Prácticas profesionales · —')).toBeInTheDocument();
    expect(luis.getByText('Servicio social')).toBeInTheDocument();
  });
});

describe('/vinculacion/asignar selection (RF-01)', () => {
  it('RF-01: the button is disabled with no selection and counts the selected students', async () => {
    signedIn();
    mockCandidatos([ANA, LUIS]);
    const { user } = renderApp(RUTA);
    await screen.findByText('Ana María López García');

    expect(screen.getByRole('button', { name: 'Asignar programa a 0 alumnos' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar a Ana María López García' }));
    expect(screen.getByRole('button', { name: 'Asignar programa a 1 alumno' })).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar a Luis Pérez Soto' }));
    expect(screen.getByRole('button', { name: 'Asignar programa a 2 alumnos' })).toBeEnabled();
  });

  it('RF-01: "Seleccionar todos" selects and clears every student', async () => {
    signedIn();
    mockCandidatos([ANA, LUIS]);
    const { user } = renderApp(RUTA);
    await screen.findByText('Ana María López García');

    const todos = screen.getByRole('checkbox', { name: 'Seleccionar todos' });
    await user.click(todos);
    expect(screen.getByRole('checkbox', { name: 'Seleccionar a Ana María López García' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Seleccionar a Luis Pérez Soto' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Asignar programa a 2 alumnos' })).toBeEnabled();

    await user.click(todos);
    expect(screen.getByRole('checkbox', { name: 'Seleccionar a Ana María López García' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Asignar programa a 0 alumnos' })).toBeDisabled();
  });
});

describe('/vinculacion/asignar assign flow (RF-01, RN-03, RN-03b)', () => {
  it('RF-01: confirms, sends the selected ids, shows assigned and omitted, and refreshes the list', async () => {
    signedIn();
    const estado = mockCandidatos([ANA, LUIS]);
    const cuerpos: unknown[] = [];
    server.use(
      http.post('*/api/expedientes/asignar', async ({ request }) => {
        cuerpos.push(await request.json());
        estado.lista = [LUIS];
        return HttpResponse.json({
          asignados: [{ alumnoId: 'alumno-1', tipo: 'PRACTICAS', expedienteId: 'exp-nuevo' }],
          omitidos: [{ alumnoId: 'alumno-2', motivo: 'El alumno ya tiene un expediente activo.' }],
        });
      }),
    );
    const { user } = renderApp(RUTA);
    await screen.findByText('Ana María López García');

    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar a Ana María López García' }));
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar a Luis Pérez Soto' }));
    await user.click(screen.getByRole('button', { name: 'Asignar programa a 2 alumnos' }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(cuerpos).toHaveLength(0);
    await user.click(within(dialogo).getByRole('button', { name: 'Sí, asignar' }));

    const resumen = within(await screen.findByRole('region', { name: 'Resultado de la asignación' }));
    await waitFor(() => expect(cuerpos).toEqual([{ alumnoIds: ['alumno-1', 'alumno-2'] }]));
    expect(resumen.getByRole('link', { name: 'Ver expediente de Ana María López García' })).toHaveAttribute(
      'href',
      '/vinculacion/expedientes/exp-nuevo',
    );
    expect(resumen.getByText(/Luis Pérez Soto/)).toBeInTheDocument();
    expect(resumen.getByText('El alumno ya tiene un expediente activo.')).toBeInTheDocument();

    // The assigned student is gone from the refreshed list; the selection was cleared.
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Seleccionar a Ana María López García' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Asignar programa a 0 alumnos' })).toBeDisabled();
  });

  it('RF-01: canceling the confirmation sends nothing', async () => {
    signedIn();
    mockCandidatos([ANA]);
    const cuerpos: unknown[] = [];
    server.use(
      http.post('*/api/expedientes/asignar', async ({ request }) => {
        cuerpos.push(await request.json());
        return HttpResponse.json({ asignados: [], omitidos: [] });
      }),
    );
    const { user } = renderApp(RUTA);
    await screen.findByText('Ana María López García');
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar a Ana María López García' }));
    await user.click(screen.getByRole('button', { name: 'Asignar programa a 1 alumno' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Volver' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(cuerpos).toHaveLength(0);
  });

  it('RF-01: shows the server error and keeps the selection', async () => {
    signedIn();
    mockCandidatos([ANA]);
    server.use(
      http.post('*/api/expedientes/asignar', () =>
        HttpResponse.json({ error: { code: 'ERROR', message: 'No se pudo asignar.' } }, { status: 500 }),
      ),
    );
    const { user } = renderApp(RUTA);
    await screen.findByText('Ana María López García');
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar a Ana María López García' }));
    await user.click(screen.getByRole('button', { name: 'Asignar programa a 1 alumno' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, asignar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo asignar.');
    expect(screen.getByRole('checkbox', { name: 'Seleccionar a Ana María López García' })).toBeChecked();
  });
});

describe('/vinculacion/asignar access (RN-03b)', () => {
  it.each([['VINCULACION' as const], ['ADMIN' as const]])('RN-03b: %s sees the menu link and reaches the screen', async (rol) => {
    signedIn(rol);
    mockCandidatos([]);
    renderApp(RUTA);
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Asignar programa' })).toHaveAttribute('href', '/vinculacion/asignar');
    expect(await screen.findByRole('heading', { level: 1, name: 'Asignar el siguiente programa' })).toBeInTheDocument();
  });

  it('RN-03b: a student cannot open the screen', async () => {
    signedIn('ALUMNO');
    const { router } = renderApp(RUTA);
    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/alumno');
    expect(screen.queryByRole('heading', { name: 'Asignar el siguiente programa' })).not.toBeInTheDocument();
  });
});
