import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCorreccion, buildExpedienteActivo, buildMe, buildSemana } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const MOTIVO = 'Olvidé registrar mi salida al terminar.';
const TURNO_ID = 'turno-2026-11-10-0';

// Tuesday 2026-11-10: a shift that entered at 09:00 and was closed at 23:59 without exit (RN-08).
const incompleta = (extra: Record<string, unknown> = {}) => ({
  entrada: '2026-11-10T15:00:00.000Z',
  salida: '2026-11-11T05:59:00.000Z',
  estado: 'INCOMPLETA',
  minutosAcreditables: 0,
  correccion: null,
  puedeSolicitarCorreccion: true,
  ...extra,
});

function mockHistorial(turno: Record<string, unknown>) {
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ expedienteActivo: buildExpedienteActivo() }))),
    http.get('*/api/asistencias', () =>
      HttpResponse.json({ semana: buildSemana({ inicio: '2026-11-09', turnosPorDia: { '2026-11-10': [turno] } }) }),
    ),
  );
}

// Records the POST bodies; the next GET of the week returns the shift with its pending request.
function mockSolicitud(respond?: () => Response) {
  const cuerpos: Record<string, unknown>[] = [];
  server.use(
    http.post(`*/api/asistencias/${TURNO_ID}/correcciones`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      cuerpos.push(body);
      if (respond) return respond();
      mockHistorial(incompleta({ puedeSolicitarCorreccion: false, correccion: buildCorreccion({ asistenciaId: TURNO_ID, ...body }) }));
      return HttpResponse.json({ correccion: buildCorreccion({ asistenciaId: TURNO_ID, ...body }) }, { status: 201 });
    }),
  );
  return cuerpos;
}

const turnoItem = async () => within(await screen.findByRole('region', { name: 'martes 10' })).getAllByRole('listitem')[0]!;

describe('/alumno/historial: solicitud de corrección (RF-17)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T16:00:00Z')); // Thursday 10:00 in Monterrey
  });
  afterEach(() => vi.useRealTimers());

  it('RN-08: an INCOMPLETA shift says it has no exit and offers a correction', async () => {
    mockHistorial(incompleta());
    renderApp('/alumno/historial');

    const item = await turnoItem();
    expect(within(item).getByText('09:00 – Sin salida registrada')).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Solicitar corrección' })).toBeInTheDocument();
  });

  it('RF-17: does not offer a correction when the API says it cannot be requested', async () => {
    mockHistorial(incompleta({ puedeSolicitarCorreccion: false }));
    renderApp('/alumno/historial');

    const item = await turnoItem();
    expect(within(item).queryByRole('button', { name: 'Solicitar corrección' })).not.toBeInTheDocument();
  });

  it('RF-17, RN-15: sends the typed Monterrey times as instants and then shows the request in review', async () => {
    mockHistorial(incompleta());
    const cuerpos = mockSolicitud();
    const { user } = renderApp('/alumno/historial');

    await user.click(within(await turnoItem()).getByRole('button', { name: 'Solicitar corrección' }));
    expect(screen.getByLabelText('Hora de entrada')).toHaveValue('09:00');
    expect(screen.getByLabelText('Hora de salida')).toHaveValue('');
    await user.type(screen.getByLabelText('Hora de salida'), '14:00');
    await user.type(screen.getByLabelText('Motivo'), MOTIVO);
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    await waitFor(() => expect(cuerpos).toHaveLength(1));
    expect(cuerpos[0]).toEqual({
      entradaNueva: '2026-11-10T15:00:00.000Z',
      salidaNueva: '2026-11-10T20:00:00.000Z',
      motivo: MOTIVO,
    });
    const item = await turnoItem();
    expect(await within(item).findByText('Corrección en revisión: 09:00 – 14:00')).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: 'Solicitar corrección' })).not.toBeInTheDocument();
  });

  it('RF-17: an exit after midnight is sent on the next day', async () => {
    mockHistorial(incompleta());
    const cuerpos = mockSolicitud();
    const { user } = renderApp('/alumno/historial');

    await user.click(within(await turnoItem()).getByRole('button', { name: 'Solicitar corrección' }));
    await user.type(screen.getByLabelText('Hora de salida'), '01:00');
    await user.click(screen.getByLabelText('La salida fue al día siguiente'));
    await user.type(screen.getByLabelText('Motivo'), MOTIVO);
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    await waitFor(() => expect(cuerpos).toHaveLength(1));
    expect(cuerpos[0]!.salidaNueva).toBe('2026-11-11T07:00:00.000Z');
  });

  it('RF-17: validates the form before sending', async () => {
    mockHistorial(incompleta());
    const cuerpos = mockSolicitud();
    const { user } = renderApp('/alumno/historial');

    await user.click(within(await turnoItem()).getByRole('button', { name: 'Solicitar corrección' }));
    await user.type(screen.getByLabelText('Motivo'), 'corto');
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    expect(await screen.findByText('Indica la hora de salida.')).toBeInTheDocument();
    expect(screen.getByText('Explica el motivo con al menos 10 caracteres.')).toBeInTheDocument();
    expect(screen.getByLabelText('Hora de salida')).toHaveAttribute('aria-invalid', 'true');
    expect(cuerpos).toHaveLength(0);
  });

  it('RF-17: shows the message of a rule the server rejects', async () => {
    mockHistorial(incompleta());
    mockSolicitud(() =>
      HttpResponse.json(
        { error: { code: 'HORA_FUTURA', message: 'La hora de salida no puede estar en el futuro.' } },
        { status: 409 },
      ),
    );
    const { user } = renderApp('/alumno/historial');

    await user.click(within(await turnoItem()).getByRole('button', { name: 'Solicitar corrección' }));
    await user.type(screen.getByLabelText('Hora de salida'), '14:00');
    await user.type(screen.getByLabelText('Motivo'), MOTIVO);
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La hora de salida no puede estar en el futuro.');
    expect(screen.getByRole('button', { name: 'Enviar solicitud' })).toBeEnabled();
  });

  it('closes the form with Cancelar', async () => {
    mockHistorial(incompleta());
    const { user } = renderApp('/alumno/historial');

    await user.click(within(await turnoItem()).getByRole('button', { name: 'Solicitar corrección' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText('Motivo')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solicitar corrección' })).toBeInTheDocument();
  });

  it('RF-17: shows a rejected request with the office comment, and an approved one', async () => {
    mockHistorial(
      incompleta({ correccion: buildCorreccion({ estado: 'RECHAZADA', comentario: 'Tu supervisor no lo confirma.' }) }),
    );
    renderApp('/alumno/historial');
    const item = await turnoItem();
    expect(within(item).getByText('Corrección rechazada')).toBeInTheDocument();
    expect(within(item).getByText('Comentario de tu oficina: «Tu supervisor no lo confirma.»')).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Solicitar corrección' })).toBeInTheDocument();
  });

  it('RF-17: an approved correction is marked on the shift', async () => {
    mockHistorial({
      entrada: '2026-11-10T15:00:00.000Z',
      salida: '2026-11-10T20:00:00.000Z',
      estado: 'CERRADA',
      minutosAcreditables: 300,
      correccion: buildCorreccion({ estado: 'APROBADA' }),
      puedeSolicitarCorreccion: true,
    });
    renderApp('/alumno/historial');
    const item = await turnoItem();
    expect(within(item).getByText('Turno corregido por tu oficina')).toBeInTheDocument();
  });
});
