import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildExpedienteActivo, buildMe, buildSemana } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const HISTORIAL_URL = '*/api/asistencias';

function mockAlumno() {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ expedienteActivo: buildExpedienteActivo() }))));
}

// Answers every week request and records the `semana` param of each call (null when absent).
function mockSemana(build: (inicio: string) => ReturnType<typeof buildSemana> = (inicio) => buildSemana({ inicio })) {
  const pedidas: (string | null)[] = [];
  server.use(
    http.get(HISTORIAL_URL, ({ request }) => {
      const semana = new URL(request.url).searchParams.get('semana');
      pedidas.push(semana);
      return HttpResponse.json({ semana: build(semana ?? '2026-11-09') });
    }),
  );
  return pedidas;
}

describe('/alumno/historial (RF-19)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T18:00:00Z')); // Wednesday 12:00 in Monterrey
    mockAlumno();
  });
  afterEach(() => vi.useRealTimers());

  it('shows a loading state', async () => {
    server.use(
      http.get(HISTORIAL_URL, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ semana: buildSemana() });
      }),
    );
    renderApp('/alumno/historial');
    expect(await screen.findByText('Cargando tu historial…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Semana del 9 al 15 de noviembre' })).toBeInTheDocument();
  });

  it('shows closed, open and offline shifts with day and week totals', async () => {
    mockSemana((inicio) =>
      buildSemana({
        inicio,
        turnosPorDia: {
          '2026-11-09': [
            { entrada: '2026-11-09T16:11:00.000Z', salida: '2026-11-09T22:18:00.000Z', minutosAcreditables: 300 },
            { entrada: '2026-11-09T23:00:00.000Z', salida: '2026-11-09T23:30:00.000Z', minutosAcreditables: 30 },
          ],
          '2026-11-11': [
            { entrada: '2026-11-11T16:26:00.000Z', salida: null, estado: 'ABIERTA', minutosAcreditables: null },
            {
              entrada: '2026-11-11T14:00:00.000Z',
              salida: '2026-11-11T15:00:00.000Z',
              minutosAcreditables: 60,
              sinConexion: true,
            },
          ],
        },
      }),
    );
    renderApp('/alumno/historial');
    const lunes = (await screen.findByRole('heading', { name: 'lunes 9' })).closest('section')!;
    expect(within(lunes).getByText('10:11 – 16:18')).toBeInTheDocument();
    expect(within(lunes).getByText('Total del día: 5 h 30 min')).toBeInTheDocument();
    expect(screen.getByText('10:26 – en curso')).toBeInTheDocument();
    expect(screen.getByText('Registrado sin conexión')).toBeInTheDocument();
    expect(screen.getByText('Total de la semana: 6 h 30 min')).toBeInTheDocument();
  });

  it('a shift that crosses midnight shows the day of its exit', async () => {
    mockSemana((inicio) =>
      buildSemana({
        inicio,
        turnosPorDia: {
          '2026-11-09': [
            { entrada: '2026-11-10T03:00:00.000Z', salida: '2026-11-10T08:00:00.000Z', minutosAcreditables: 300 },
          ],
        },
      }),
    );
    renderApp('/alumno/historial');
    // 03:00Z is 21:00 of Nov 9 in Monterrey; 08:00Z is 02:00 of Nov 10.
    expect(await screen.findByText('21:00 – 02:00 (martes 10)')).toBeInTheDocument();
  });

  it('RN-08: muestra el turno incompleto sin salida', async () => {
    mockSemana((inicio) =>
      buildSemana({
        inicio,
        turnosPorDia: {
          '2026-11-10': [
            { entrada: '2026-11-10T16:00:00.000Z', salida: null, estado: 'INCOMPLETA', minutosAcreditables: 0 },
          ],
        },
      }),
    );
    renderApp('/alumno/historial');
    const martes = (await screen.findByRole('heading', { name: 'martes 10' })).closest('section')!;
    expect(within(martes).getByText(/Sin salida registrada/)).toBeInTheDocument();
    expect(within(martes).getByText('Acreditado: 0 h')).toBeInTheDocument();
  });

  it('RN-04: avisa los minutos del día que no se acreditan por el tope', async () => {
    mockSemana((inicio) =>
      buildSemana({
        inicio,
        turnosPorDia: { '2026-11-09': [{ minutosAcreditables: 300 }] },
        totalesDia: { '2026-11-09': { minutosDia: 390, minutosAcreditablesDia: 300 } },
      }),
    );
    renderApp('/alumno/historial');
    expect(await screen.findByText('1 h 30 min no se acreditan (tope de 5 h por día)')).toBeInTheDocument();
  });

  it('RN-04: does not show the cap notice when the whole day is credited', async () => {
    mockSemana((inicio) => buildSemana({ inicio, turnosPorDia: { '2026-11-09': [{}] } }));
    renderApp('/alumno/historial');
    await screen.findByRole('heading', { name: 'lunes 9' });
    expect(screen.queryByText(/no se acreditan/)).not.toBeInTheDocument();
  });

  it('shows "Sin registros" for days without shifts', async () => {
    mockSemana((inicio) => buildSemana({ inicio, turnosPorDia: { '2026-11-09': [{}] } }));
    renderApp('/alumno/historial');
    await screen.findByRole('heading', { name: 'lunes 9' });
    expect(screen.getAllByText('Sin registros')).toHaveLength(6);
  });

  it('shows an empty-week message when there are no shifts', async () => {
    mockSemana();
    renderApp('/alumno/historial');
    expect(await screen.findByText('No hay registros esta semana')).toBeInTheDocument();
  });

  it.each([
    [null, 'Sin enviar'],
    ['BORRADOR', 'Sin enviar'],
    ['ENVIADA', 'Enviada a tu supervisor'],
    ['VALIDADA', 'Validada'],
    ['RECHAZADA', 'Rechazada'],
  ])('shows the validation state %s as "%s"', async (estado, texto) => {
    mockSemana((inicio) => buildSemana({ inicio, estadoValidacion: estado }));
    renderApp('/alumno/historial');
    expect(await screen.findByText(texto)).toBeInTheDocument();
  });

  it('without ?semana asks for the current week and "Semana siguiente" is disabled', async () => {
    const pedidas = mockSemana();
    renderApp('/alumno/historial');
    await screen.findByRole('heading', { name: 'Semana del 9 al 15 de noviembre' });
    expect(pedidas).toEqual([null]);
    expect(screen.getByRole('button', { name: 'Semana siguiente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeEnabled();
  });

  it('opening ?semana=2026-11-02 asks for that week', async () => {
    const pedidas = mockSemana();
    renderApp('/alumno/historial?semana=2026-11-02');
    expect(await screen.findByRole('heading', { name: 'Semana del 2 al 8 de noviembre' })).toBeInTheDocument();
    expect(pedidas).toEqual(['2026-11-02']);
    expect(screen.getByRole('button', { name: 'Semana siguiente' })).toBeEnabled();
  });

  it('"Semana anterior" asks for inicio - 7 days and changes the URL; "Semana siguiente" goes back', async () => {
    const pedidas = mockSemana();
    const { router, user } = renderApp('/alumno/historial');
    await screen.findByRole('heading', { name: 'Semana del 9 al 15 de noviembre' });

    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(await screen.findByRole('heading', { name: 'Semana del 2 al 8 de noviembre' })).toBeInTheDocument();
    expect(pedidas.at(-1)).toBe('2026-11-02');
    expect(router.state.location.search).toBe('?semana=2026-11-02');

    await user.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    expect(await screen.findByRole('heading', { name: 'Semana del 9 al 15 de noviembre' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?semana=2026-11-09');
  });

  it('shows the range with both months when the week crosses a month', async () => {
    mockSemana();
    renderApp('/alumno/historial?semana=2026-10-26');
    expect(
      await screen.findByRole('heading', { name: 'Semana del 26 de octubre al 1 de noviembre' }),
    ).toBeInTheDocument();
  });

  it('shows a message when the student has no expediente', async () => {
    server.use(
      http.get(HISTORIAL_URL, () =>
        HttpResponse.json(
          { error: { code: 'EXPEDIENTE_NO_ENCONTRADO', message: 'No tienes ningún expediente.' } },
          { status: 404 },
        ),
      ),
    );
    renderApp('/alumno/historial');
    expect(await screen.findByText('No tienes un expediente. Acude a vinculación.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('shows an error and retries', async () => {
    let calls = 0;
    server.use(
      http.get(HISTORIAL_URL, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ error: { code: 'INTERNAL', message: 'Falla' } }, { status: 500 });
        return HttpResponse.json({ semana: buildSemana() });
      }),
    );
    const { user } = renderApp('/alumno/historial');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar tu historial.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Semana del 9 al 15 de noviembre' })).toBeInTheDocument();
  });

  it('links back to the home screen', async () => {
    mockSemana();
    renderApp('/alumno/historial');
    expect(await screen.findByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/alumno');
  });
});
