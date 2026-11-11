import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAvance, buildExpedienteActivo, buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const AVANCE_URL = '*/api/expedientes/:id/avance';

function mockAlumno(expediente: Record<string, unknown> | null = buildExpedienteActivo()) {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ expedienteActivo: expediente }))));
}

function mockAvance(overrides: Record<string, unknown> = {}) {
  server.use(http.get(AVANCE_URL, () => HttpResponse.json({ avance: buildAvance(overrides) })));
}

describe('/alumno layout and routes', () => {
  it('shows the app name and sign out in the header, and the home content', async () => {
    mockAlumno(null);
    renderApp('/alumno');
    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
    expect(screen.getByText('Praxis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });
});

describe('/alumno home (RF-18)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T18:00:00Z')); // 12:00 in Monterrey
  });
  afterEach(() => vi.useRealTimers());

  it('shows a loading state', async () => {
    mockAlumno();
    server.use(
      http.get(AVANCE_URL, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ avance: buildAvance() });
      }),
    );
    renderApp('/alumno');
    expect(await screen.findByText('Cargando tu avance…')).toBeInTheDocument();
    expect(await screen.findByRole('progressbar', { name: 'Avance validado' })).toBeInTheDocument();
  });

  it('shows an error and retries', async () => {
    mockAlumno();
    let calls = 0;
    server.use(
      http.get(AVANCE_URL, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ error: { code: 'ERROR_INTERNO', message: 'Falló.' } }, { status: 500 })
          : HttpResponse.json({ avance: buildAvance() });
      }),
    );
    const { user } = renderApp('/alumno');
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('progressbar', { name: 'Avance validado' })).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('EN_PROCESO shows the full screen with an accessible progress value', async () => {
    mockAlumno();
    mockAvance();
    renderApp('/alumno');
    const bar = await screen.findByRole('progressbar', { name: 'Avance validado' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByText('2 %')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar' })).toHaveAttribute('href', '/alumno/registrar');
    expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('href', '/alumno/historial');
  });

  it('RN-11: muestra horas validadas y registradas por separado', async () => {
    mockAlumno();
    mockAvance();
    renderApp('/alumno');
    expect(await screen.findByText('12 h 30 min de 480 h')).toBeInTheDocument();
    expect(screen.getByText('15 h')).toBeInTheDocument(); // registered, not yet validated
    expect(screen.getByText('467 h 30 min')).toBeInTheDocument(); // remaining
    expect(screen.getByText(/Validadas/)).toBeInTheDocument();
    expect(screen.getByText(/Registradas sin validar/)).toBeInTheDocument();
    expect(screen.getByText(/Faltan/)).toBeInTheDocument();
  });

  it('shows the estimated date (ESTIMADA)', async () => {
    mockAlumno();
    mockAvance();
    renderApp('/alumno');
    expect(await screen.findByText('Terminarías aproximadamente el lunes 16 de noviembre')).toBeInTheDocument();
  });

  it('RN-16: sin datos suficientes', async () => {
    mockAlumno();
    mockAvance({ fechaEstimada: { tipo: 'SIN_DATOS' } });
    renderApp('/alumno');
    expect(await screen.findByText('Aún sin datos suficientes')).toBeInTheDocument();
  });

  it('shows the completed message (COMPLETADO)', async () => {
    mockAlumno();
    mockAvance({ fechaEstimada: { tipo: 'COMPLETADO' } });
    renderApp('/alumno');
    expect(await screen.findByText('Ya registraste las horas de tu meta; falta que se validen')).toBeInTheDocument();
  });

  it('shows an open shift from today with its Monterrey time', async () => {
    mockAlumno();
    mockAvance({ turnoAbierto: { id: 'a1', entrada: '2026-11-11T16:11:00Z' } });
    renderApp('/alumno');
    expect(await screen.findByText('Turno abierto desde las 10:11')).toBeInTheDocument();
  });

  it('shows the date too when the open shift is from another day', async () => {
    mockAlumno();
    mockAvance({ turnoAbierto: { id: 'a1', entrada: '2026-11-10T16:11:00Z' } });
    renderApp('/alumno');
    expect(await screen.findByText('Turno abierto desde las 10:11 del martes 10 de noviembre')).toBeInTheDocument();
  });

  it('shows "Sin turno abierto" without an open shift', async () => {
    mockAlumno();
    mockAvance();
    renderApp('/alumno');
    expect(await screen.findByText('Sin turno abierto')).toBeInTheDocument();
  });

  it('shows a message and no progress or Registrar without an active expediente', async () => {
    mockAlumno(null);
    renderApp('/alumno');
    expect(await screen.findByText('No tienes un expediente activo. Acude a vinculación.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Registrar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();
  });

  it('PENDIENTE asks to complete the expediente, without progress or Registrar', async () => {
    mockAlumno(buildExpedienteActivo({ estado: 'PENDIENTE' }));
    renderApp('/alumno');
    expect(await screen.findByText('Completa tu expediente para empezar a registrar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Completar expediente' })).toHaveAttribute('href', '/alumno/expediente');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Registrar' })).not.toBeInTheDocument();
  });

  it('RN-13: con expediente suspendido no se puede registrar', async () => {
    mockAlumno(buildExpedienteActivo({ estado: 'SUSPENDIDO' }));
    mockAvance();
    renderApp('/alumno');
    expect(
      await screen.findByText('Tu expediente está suspendido; no puedes registrar asistencia. Acude a vinculación.'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('progressbar', { name: 'Avance validado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Registrar' })).not.toBeInTheDocument();
  });
});
