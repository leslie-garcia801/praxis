import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  buildFilaPanel,
  buildInstitucion,
  buildMe,
  buildPanel,
  carrerasEjemplo,
} from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const ANA = '44444444-4444-4444-8444-444444444441';
const BETO = '44444444-4444-4444-8444-444444444442';
const INSTITUCION = '33333333-3333-4333-8333-333333333333';

const filaAna = buildFilaPanel();
const filaBeto = buildFilaPanel({
  expediente: { id: BETO, tipo: 'SERVICIO_SOCIAL', estado: 'EN_PROCESO', fechaInicio: '2026-03-02', fechaTermino: null },
  alumno: {
    id: '88888888-8888-4888-8888-888888888882',
    nombre: 'Beto Ruiz Soto',
    matricula: '25319051760002',
    carrera: 'Contabilidad',
    semestre: 3,
    grupo: 'B',
    turno: 'VESPERTINO',
  },
  riesgo: 'EN_RIESGO',
  limite: '2026-05-01',
  fechaEstimada: '2026-08-20',
  porcentaje: 40,
});

// A row for another student, with only the given fields changed.
function otraFila(id: string, nombre: string, overrides: Record<string, unknown> = {}) {
  return buildFilaPanel({
    expediente: { ...filaAna.expediente, id },
    alumno: { ...filaAna.alumno, id: `alumno-${id}`, nombre },
    ...overrides,
  });
}

function mockStaff(rol: 'VINCULACION' | 'ADMIN' = 'VINCULACION', oficina?: 'SERVICIO_SOCIAL' | 'PRACTICAS' | null) {
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ rol, oficina }))),
    http.get('*/api/carreras', () => HttpResponse.json({ carreras: carrerasEjemplo })),
    http.get('*/api/instituciones', () => HttpResponse.json({ instituciones: [buildInstitucion()] })),
  );
}

// Serves `body` and records the query string of every request.
function mockPanel(body = buildPanel({ alumnos: [filaAna, filaBeto] })) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get('*/api/panel/alumnos', ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json(body);
    }),
  );
  return requests;
}

function filaDe(nombre: string) {
  return within(screen.getByText(nombre).closest('tr') as HTMLElement);
}

describe('/vinculacion panel (RF-23, RF-24)', () => {
  it('shows the rows with their data and the student counter', async () => {
    mockStaff();
    mockPanel();
    renderApp('/vinculacion');

    expect(await screen.findByRole('heading', { name: 'Panel de vinculación' })).toBeInTheDocument();
    expect(await screen.findByText('Ana María López García')).toBeInTheDocument();
    expect(screen.getByText('2 alumnos')).toBeInTheDocument();
    const ana = filaDe('Ana María López García');
    expect(ana.getByText('25319051769999')).toBeInTheDocument();
    expect(ana.getByText(/Programación/)).toBeInTheDocument();
    expect(ana.getByText('Hospital Alfa')).toBeInTheDocument();
    expect(ana.getByText(/25 h \/ 480 h/)).toBeInTheDocument();
    expect(ana.getByText(/2 h/)).toBeInTheDocument();
    expect(ana.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
  });

  it('RN-06a: highlights at-risk students with their deadline', async () => {
    mockStaff();
    mockPanel();
    renderApp('/vinculacion');

    await screen.findByText('Beto Ruiz Soto');
    const beto = filaDe('Beto Ruiz Soto');
    expect(beto.getByText('En riesgo')).toBeInTheDocument();
    expect(beto.getByText(/Límite: viernes 1 de mayo/)).toBeInTheDocument();
    const ana = filaDe('Ana María López García');
    expect(ana.getByText('En tiempo')).toBeInTheDocument();
    expect(ana.queryByText(/Límite/)).not.toBeInTheDocument();
  });

  it('RN-06a: labels the other risk states', async () => {
    mockStaff();
    mockPanel(
      buildPanel({
        alumnos: [
          buildFilaPanel({ riesgo: 'SIN_DATOS' }),
          otraFila('x2', 'Carla', { riesgo: 'NO_EVALUABLE' }),
          otraFila('x3', 'Diego', { riesgo: 'COMPLETADO', fechaEstimada: null }),
        ],
      }),
    );
    renderApp('/vinculacion');

    await screen.findByText('Carla');
    expect(filaDe('Ana María López García').getByText('Sin datos suficientes')).toBeInTheDocument();
    expect(filaDe('Carla').getByText('No evaluable')).toBeInTheDocument();
    expect(filaDe('Diego').getByText('Completado')).toBeInTheDocument();
  });

  it('shows the estimated date, or "Sin datos suficientes" when there is none', async () => {
    mockStaff();
    mockPanel(buildPanel({ alumnos: [filaAna, otraFila('x2', 'Carla', { fechaEstimada: null })] }));
    renderApp('/vinculacion');

    await screen.findByText('Carla');
    expect(filaDe('Ana María López García').getByText(/1 de febrero/)).toBeInTheDocument();
    expect(filaDe('Carla').getByText('Sin datos suficientes')).toBeInTheDocument();
  });

  it('RN-15: shows the last record in Monterrey time', async () => {
    mockStaff();
    mockPanel(
      buildPanel({
        alumnos: [
          // 03:30 UTC on the 11th is 21:30 on the 10th in Monterrey.
          buildFilaPanel({ ultimoRegistro: '2026-11-11T03:30:00.000Z' }),
          otraFila('x2', 'Carla', { ultimoRegistro: null }),
        ],
      }),
    );
    renderApp('/vinculacion');

    await screen.findByText('Carla');
    const ana = filaDe('Ana María López García');
    expect(ana.getByText(/10 de noviembre/)).toBeInTheDocument();
    expect(ana.getByText(/21:30/)).toBeInTheDocument();
    expect(filaDe('Carla').getByText('Sin registros')).toBeInTheDocument();
  });

  it('shows the pending weeks of each student', async () => {
    mockStaff();
    mockPanel();
    renderApp('/vinculacion');
    await screen.findByText('Ana María López García');
    expect(screen.getByRole('columnheader', { name: 'Semanas pendientes' })).toBeInTheDocument();
    // Columns: alumno, carrera, institución, avance, sin validar, último registro, semanas pendientes, ...
    expect(filaDe('Ana María López García').getAllByRole('cell')[6]).toHaveTextContent('2');
  });

  describe('alerts (RF-24)', () => {
    const alertas = {
      sinRegistros: { total: 1, expedienteIds: [BETO] },
      semanasSinValidar: { total: 4, expedienteIds: [ANA] },
      turnosIncompletos: { total: 2, expedienteIds: [ANA, BETO] },
      supervisoresSinConfirmar: {
        total: 1,
        supervisores: [
          { id: 's1', nombre: 'Marta Mendoza', institucion: { id: 'i1', nombre: 'Clínica Beta' }, expedienteIds: [ANA] },
        ],
      },
    };

    it('shows the four cards with their totals', async () => {
      mockStaff();
      mockPanel(buildPanel({ alumnos: [filaAna, filaBeto], alertas }));
      renderApp('/vinculacion');

      expect(await screen.findByRole('button', { name: /1.*Sin registros en 7 días/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /4.*Semanas sin validar \(más de 7 días\)/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /2.*Turnos incompletos/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /1.*Supervisores por confirmar/ })).toBeInTheDocument();
    });

    it('filters the table to the alert students and "Quitar" undoes it', async () => {
      mockStaff();
      const requests = mockPanel(buildPanel({ alumnos: [filaAna, filaBeto], alertas }));
      const { user, router } = renderApp('/vinculacion');
      await screen.findByText('Ana María López García');

      await user.click(screen.getByRole('button', { name: /Sin registros en 7 días/ }));

      expect(screen.queryByText('Ana María López García')).not.toBeInTheDocument();
      expect(screen.getByText('Beto Ruiz Soto')).toBeInTheDocument();
      expect(screen.getByText('1 alumno')).toBeInTheDocument();
      expect(screen.getByText(/Mostrando: Sin registros en 7 días/)).toBeInTheDocument();
      // The filter is local (no new request) and lives in the URL.
      expect(requests).toHaveLength(1);
      expect(router.state.location.search).toBe('?alerta=sinRegistros');

      await user.click(screen.getByRole('button', { name: 'Quitar' }));

      expect(screen.getByText('Ana María López García')).toBeInTheDocument();
      expect(screen.getByText('2 alumnos')).toBeInTheDocument();
      expect(screen.queryByText(/Mostrando:/)).not.toBeInTheDocument();
      expect(router.state.location.search).toBe('');
    });

    it('opens with the alert filter when the URL carries it', async () => {
      mockStaff();
      const requests = mockPanel(buildPanel({ alumnos: [filaAna, filaBeto], alertas }));
      renderApp('/vinculacion?alerta=turnosIncompletos');
      expect(await screen.findByText(/Mostrando: Turnos incompletos/)).toBeInTheDocument();
      expect(screen.getByText('2 alumnos')).toBeInTheDocument();
      expect(requests[0]?.has('alerta')).toBe(false);
    });

    it('unfolds the list of supervisors to confirm', async () => {
      mockStaff();
      mockPanel(buildPanel({ alumnos: [filaAna], alertas }));
      const { user } = renderApp('/vinculacion');
      const card = await screen.findByRole('button', { name: /Supervisores por confirmar/ });
      expect(screen.queryByText('Marta Mendoza')).not.toBeInTheDocument();

      await user.click(card);

      expect(screen.getByText('Marta Mendoza')).toBeInTheDocument();
      expect(screen.getByText(/Clínica Beta/)).toBeInTheDocument();
      expect(card).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('filters (RF-23)', () => {
    it('sends no parameter by default', async () => {
      mockStaff();
      const requests = mockPanel();
      renderApp('/vinculacion');
      await screen.findByText('Ana María López García');
      expect(requests[0]?.toString()).toBe('');
      expect(screen.getByLabelText('Estado')).toHaveValue('');
      expect(screen.getByRole('option', { name: 'En proceso y suspendidos' })).toBeInTheDocument();
    });

    it('changes the URL and the query', async () => {
      mockStaff();
      const requests = mockPanel();
      const { user, router } = renderApp('/vinculacion');
      await screen.findByText('Ana María López García');
      await screen.findByRole('option', { name: 'Programación' });
      await screen.findByRole('option', { name: 'Hospital Alfa' });

      await user.selectOptions(screen.getByLabelText('Estado'), 'TODOS');
      await user.selectOptions(screen.getByLabelText('Carrera'), carrerasEjemplo[1]!.id);
      await user.selectOptions(screen.getByLabelText('Semestre'), '5');
      await user.selectOptions(screen.getByLabelText('Turno'), 'MATUTINO');
      await user.selectOptions(screen.getByLabelText('Institución'), INSTITUCION);
      await user.click(screen.getByRole('checkbox', { name: 'Solo en riesgo' }));
      await user.type(screen.getByLabelText('Grupo'), 'A{Enter}');

      await waitFor(() => {
        const last = requests[requests.length - 1]!;
        expect(Object.fromEntries(last)).toEqual({
          estado: 'TODOS',
          carreraId: carrerasEjemplo[1]!.id,
          semestre: '5',
          turno: 'MATUTINO',
          institucionId: INSTITUCION,
          riesgo: 'EN_RIESGO',
          grupo: 'A',
        });
      });
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get('estado')).toBe('TODOS');
      expect(params.get('riesgo')).toBe('EN_RIESGO');
      expect(params.get('grupo')).toBe('A');
    });

    it('opens /vinculacion?riesgo=EN_RIESGO with that filter applied', async () => {
      mockStaff();
      const requests = mockPanel();
      renderApp('/vinculacion?riesgo=EN_RIESGO');
      await screen.findByText('Ana María López García');
      expect(requests[0]?.get('riesgo')).toBe('EN_RIESGO');
      expect(screen.getByRole('checkbox', { name: 'Solo en riesgo' })).toBeChecked();
    });

    it('"Limpiar filtros" clears the URL and the query', async () => {
      mockStaff();
      const requests = mockPanel(
        buildPanel({ alumnos: [filaAna, filaBeto], alertas: { sinRegistros: { total: 1, expedienteIds: [ANA] } } }),
      );
      const { user, router } = renderApp('/vinculacion?riesgo=EN_RIESGO&estado=TODOS&alerta=sinRegistros');
      await screen.findByText('Ana María López García');

      await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

      expect(router.state.location.search).toBe('');
      await waitFor(() => expect(requests[requests.length - 1]?.toString()).toBe(''));
      expect(screen.getByRole('checkbox', { name: 'Solo en riesgo' })).not.toBeChecked();
    });

    it('RN-03b: offers the program type to users who see both offices', async () => {
      mockStaff('VINCULACION', null);
      mockPanel();
      const { user, router } = renderApp('/vinculacion');
      await screen.findByText('Ana María López García');
      await user.selectOptions(screen.getByLabelText('Tipo'), 'PRACTICAS');
      expect(router.state.location.search).toBe('?tipo=PRACTICAS');
    });

    it('RN-03b: the admin also sees the program type', async () => {
      mockStaff('ADMIN');
      mockPanel();
      renderApp('/vinculacion');
      await screen.findByText('Ana María López García');
      expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    });

    it('RN-03b: hides the program type from a single-office user', async () => {
      mockStaff('VINCULACION', 'PRACTICAS');
      mockPanel();
      renderApp('/vinculacion');
      await screen.findByText('Ana María López García');
      expect(screen.queryByLabelText('Tipo')).not.toBeInTheDocument();
    });
  });

  describe('states', () => {
    it('shows loading, then the empty state', async () => {
      mockStaff();
      mockPanel(buildPanel());
      renderApp('/vinculacion');
      expect(await screen.findByText('Cargando alumnos…')).toBeInTheDocument();
      expect(await screen.findByText('No hay alumnos con estos filtros')).toBeInTheDocument();
      expect(screen.getByText('0 alumnos')).toBeInTheDocument();
    });

    it('shows the error with "Reintentar" and recovers', async () => {
      mockStaff();
      let calls = 0;
      server.use(
        http.get('*/api/panel/alumnos', () => {
          calls += 1;
          return calls === 1
            ? HttpResponse.json({ error: { code: 'INTERNAL', message: 'Error del servidor.' } }, { status: 500 })
            : HttpResponse.json(buildPanel({ alumnos: [filaAna] }));
        }),
      );
      const { user } = renderApp('/vinculacion');

      expect(await screen.findByRole('alert')).toHaveTextContent('Error del servidor.');
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByText('Ana María López García')).toBeInTheDocument();
    });

    it('shows the API message for a 403 on the program type, without retry', async () => {
      mockStaff('VINCULACION', null);
      server.use(
        http.get('*/api/panel/alumnos', () =>
          HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'No tienes acceso a ese programa.' } }, { status: 403 }),
        ),
      );
      renderApp('/vinculacion?tipo=PRACTICAS');

      expect(await screen.findByRole('alert')).toHaveTextContent('No tienes acceso a ese programa.');
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    });

    it('keeps the filters usable while a 403 is shown', async () => {
      mockStaff('VINCULACION', null);
      server.use(
        http.get('*/api/panel/alumnos', ({ request }) =>
          new URL(request.url).searchParams.has('tipo')
            ? HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'No tienes acceso a ese programa.' } }, { status: 403 })
            : HttpResponse.json(buildPanel({ alumnos: [filaAna] })),
        ),
      );
      const { user } = renderApp('/vinculacion?tipo=PRACTICAS');
      await screen.findByRole('alert');
      await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
      expect(await screen.findByText('Ana María López García')).toBeInTheDocument();
    });
  });
});
