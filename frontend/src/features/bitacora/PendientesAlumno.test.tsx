import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAvance, buildExpedienteActivo, buildMe, buildPendiente } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const PENDIENTES_URL = '*/api/semanas/pendientes';

function mockInicio(pendientes: Record<string, unknown>[], expediente: Record<string, unknown> | null = buildExpedienteActivo()) {
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ expedienteActivo: expediente }))),
    http.get('*/api/expedientes/:id/avance', () => HttpResponse.json({ avance: buildAvance() })),
    http.get(PENDIENTES_URL, () => HttpResponse.json({ pendientes })),
  );
}

describe('/alumno pendientes (RF-18, RF-22, RN-17)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T18:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('shows a loading state', async () => {
    mockInicio([]);
    server.use(
      http.get(PENDIENTES_URL, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ pendientes: [] });
      }),
    );
    renderApp('/alumno');
    expect(await screen.findByText('Cargando tus pendientes…')).toBeInTheDocument();
    expect(await screen.findByText('No tienes pendientes')).toBeInTheDocument();
  });

  it('shows "No tienes pendientes" when the list is empty', async () => {
    mockInicio([]);
    renderApp('/alumno');
    expect(await screen.findByRole('heading', { name: 'Pendientes' })).toBeInTheDocument();
    expect(await screen.findByText('No tienes pendientes')).toBeInTheDocument();
  });

  it('RF-22: una semana rechazada pide corregir la bitácora y muestra el comentario', async () => {
    mockInicio([
      buildPendiente({ estado: 'RECHAZADA', motivo: 'RECHAZADA', comentario: 'Detalla las actividades.' }),
    ]);
    renderApp('/alumno');
    const enlace = await screen.findByRole('link', { name: 'Corrige la bitácora de la semana del 2 al 8 de noviembre' });
    expect(enlace).toHaveAttribute('href', '/alumno/historial?semana=2026-11-02');
    expect(screen.getByText('Comentario de tu supervisor: «Detalla las actividades.»')).toBeInTheDocument();
  });

  it('RN-17: una semana cerrada sin bitácora válida pide escribirla para enviarla', async () => {
    mockInicio([buildPendiente({ motivo: 'BITACORA_PENDIENTE' })]);
    renderApp('/alumno');
    const enlace = await screen.findByRole('link', {
      name: 'Escribe la bitácora de la semana del 2 al 8 de noviembre para enviarla',
    });
    expect(enlace).toHaveAttribute('href', '/alumno/historial?semana=2026-11-02');
  });

  it('la semana en curso pide escribir la bitácora de esta semana', async () => {
    mockInicio([buildPendiente({ semanaInicio: '2026-11-09', semanaFin: '2026-11-15', motivo: 'BITACORA_SEMANA_ACTUAL' })]);
    renderApp('/alumno');
    const enlace = await screen.findByRole('link', { name: 'Escribe la bitácora de esta semana' });
    expect(enlace).toHaveAttribute('href', '/alumno/historial?semana=2026-11-09');
  });

  it('lists several pending weeks in the order the API returns them', async () => {
    mockInicio([
      buildPendiente({ id: 'a', semanaInicio: '2026-11-09', semanaFin: '2026-11-15', motivo: 'BITACORA_SEMANA_ACTUAL' }),
      buildPendiente({ id: 'b', motivo: 'BITACORA_PENDIENTE' }),
    ]);
    renderApp('/alumno');
    const lista = await screen.findByRole('list', { name: 'Pendientes' });
    const items = within(lista).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Escribe la bitácora de esta semana');
    expect(items[1]).toHaveTextContent('semana del 2 al 8 de noviembre');
  });

  it('shows an error and retries', async () => {
    mockInicio([]);
    let calls = 0;
    server.use(
      http.get(PENDIENTES_URL, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ error: { code: 'ERROR_INTERNO', message: 'Falló.' } }, { status: 500 })
          : HttpResponse.json({ pendientes: [] });
      }),
    );
    const { user } = renderApp('/alumno');
    expect(await screen.findByText('No se pudieron cargar tus pendientes.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No tienes pendientes')).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('SUSPENDIDO still shows the pending weeks (RN-13: keeps the logbook)', async () => {
    mockInicio([buildPendiente()], buildExpedienteActivo({ estado: 'SUSPENDIDO' }));
    renderApp('/alumno');
    expect(await screen.findByRole('link', { name: /Escribe la bitácora de la semana del 2 al 8 de noviembre/ })).toBeInTheDocument();
  });

  it('PENDIENTE and no expediente do not request or show pending weeks', async () => {
    let pedidas = 0;
    server.use(
      http.get(PENDIENTES_URL, () => {
        pedidas += 1;
        return HttpResponse.json({ pendientes: [] });
      }),
    );
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ expedienteActivo: buildExpedienteActivo({ estado: 'PENDIENTE' }) }))));
    renderApp('/alumno');
    await screen.findByText('Completa tu expediente para empezar a registrar');
    expect(screen.queryByRole('heading', { name: 'Pendientes' })).not.toBeInTheDocument();
    expect(pedidas).toBe(0);
  });
});
