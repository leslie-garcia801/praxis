import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildExpedienteActivo, buildMe, buildSemana, buildSemanaLibreta } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';
import { avanceKeys } from '../avance/api';
import { pendientesKeys } from '../bitacora/api';
import { historialKeys } from '../historial/api';

const POST_URL = '*/api/semanas/libreta';
const SEMANA_ID = '88888888-8888-4888-8888-888888888801';
const PUT_URL = `*/api/semanas/${SEMANA_ID}/libreta`;

function mockAlumno(expediente: Record<string, unknown> | null = buildExpedienteActivo()) {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ expedienteActivo: expediente }))));
}

async function llenarFila(user: UserEvent, n: number, fecha: string, entrada: string, salida: string) {
  await user.type(screen.getByLabelText(`Fecha del turno ${n}`), fecha);
  await user.type(screen.getByLabelText(`Hora de entrada del turno ${n}`), entrada);
  await user.type(screen.getByLabelText(`Hora de salida del turno ${n}`), salida);
}

// Captures the JSON body of the next POST and answers with the given response.
function mockPost(respuesta: () => Response) {
  const cuerpos: { turnos: { id: string; fecha: string; entrada: string; salida: string }[] }[] = [];
  server.use(
    http.post(POST_URL, async ({ request }) => {
      cuerpos.push((await request.json()) as (typeof cuerpos)[number]);
      return respuesta();
    }),
  );
  return cuerpos;
}

describe('/alumno/libreta (RF-17a, RN-19)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T18:00:00Z')); // Wednesday 12:00 in Monterrey
    mockAlumno();
  });
  afterEach(() => vi.useRealTimers());

  it('RF-17a: explica que las horas se confirman con el supervisor y solo cuentan al validarse', async () => {
    renderApp('/alumno/libreta');
    expect(await screen.findByRole('heading', { name: 'Agregar horas' })).toBeInTheDocument();
    expect(screen.getByText(/ya firmaste en tu libreta de papel/)).toBeInTheDocument();
    expect(screen.getByText(/solo cuentan cuando tu supervisor las valide/)).toBeInTheDocument();
    expect(screen.getByText(/semanas anteriores a la actual/)).toBeInTheDocument();
    expect(screen.getByText(/no puede cruzar la medianoche/)).toBeInTheDocument();
  });

  it('RN-19: sin expediente en proceso muestra un mensaje y no el formulario', async () => {
    mockAlumno(buildExpedienteActivo({ estado: 'SUSPENDIDO' }));
    renderApp('/alumno/libreta');
    expect(await screen.findByText(/Solo puedes agregar horas de libreta cuando tu expediente está en proceso/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar turno' })).not.toBeInTheDocument();
  });

  it('RF-17a: agrega y quita filas de turnos (máximo 200)', async () => {
    const { user } = renderApp('/alumno/libreta');
    expect(await screen.findByLabelText('Fecha del turno 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar turno 1' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Agregar turno' }));
    expect(screen.getByLabelText('Fecha del turno 2')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Hora de entrada del turno 2'), '09:00');
    await user.click(screen.getByRole('button', { name: 'Quitar turno 1' }));
    expect(screen.queryByLabelText('Fecha del turno 2')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Hora de entrada del turno 1')).toHaveValue('09:00');
  });

  it('RF-17a: valida en el cliente los campos vacíos', async () => {
    const { user } = renderApp('/alumno/libreta');
    await user.click(await screen.findByRole('button', { name: 'Revisar y enviar' }));
    expect(await screen.findByText('Indica la fecha.')).toBeInTheDocument();
    expect(screen.getByText('Indica la hora de entrada.')).toBeInTheDocument();
    expect(screen.getByText('Indica la hora de salida.')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha del turno 1')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('RF-17a: la salida debe ser posterior a la entrada', async () => {
    const { user } = renderApp('/alumno/libreta');
    await screen.findByLabelText('Fecha del turno 1');
    await llenarFila(user, 1, '2026-11-02', '14:00', '10:00');
    await user.click(screen.getByRole('button', { name: 'Revisar y enviar' }));
    expect(await screen.findByText('La salida debe ser posterior a la entrada.')).toBeInTheDocument();
  });

  it('RN-19: no acepta fechas de la semana en curso ni futuras', async () => {
    const { user } = renderApp('/alumno/libreta');
    await screen.findByLabelText('Fecha del turno 1');
    await llenarFila(user, 1, '2026-11-09', '08:00', '12:00');
    await user.click(screen.getByRole('button', { name: 'Revisar y enviar' }));
    expect(await screen.findByText('Solo se pueden capturar semanas ya cerradas (anteriores a la actual).')).toBeInTheDocument();
  });

  it('RF-17a: la vista previa agrupa por semana con totales por día y por semana', async () => {
    const { user } = renderApp('/alumno/libreta');
    await screen.findByLabelText('Fecha del turno 1');
    await llenarFila(user, 1, '2026-11-02', '08:00', '12:00');
    await user.click(screen.getByRole('button', { name: 'Agregar turno' }));
    await llenarFila(user, 2, '2026-11-02', '13:00', '14:30');
    await user.click(screen.getByRole('button', { name: 'Agregar turno' }));
    await llenarFila(user, 3, '2026-10-27', '09:00', '10:00');

    const vista = screen.getByRole('region', { name: 'Vista previa' });
    expect(within(vista).getByText('Semana del 2 al 8 de noviembre')).toBeInTheDocument();
    expect(within(vista).getByText('lunes 2: 5 h 30 min')).toBeInTheDocument();
    expect(within(vista).getByText('Total de la semana: 5 h 30 min')).toBeInTheDocument();
    expect(within(vista).getByText('Semana del 26 de octubre al 1 de noviembre')).toBeInTheDocument();
    expect(within(vista).getByText('Total de la semana: 1 h')).toBeInTheDocument();
    expect(within(vista).getByText(/tope de 6 h 30 min por día/)).toBeInTheDocument();
  });

  it('RF-17a: pide confirmación, envía el cuerpo esperado y muestra las semanas enviadas', async () => {
    const cuerpos = mockPost(() => HttpResponse.json({ semanas: [buildSemanaLibreta()] }, { status: 201 }));
    const { user, queryClient } = renderApp('/alumno/libreta');
    queryClient.setQueryData(pendientesKeys.all, { pendientes: [] });
    queryClient.setQueryData(historialKeys.semana(undefined), {});
    queryClient.setQueryData(avanceKeys.detalle('x'), {});
    await screen.findByLabelText('Fecha del turno 1');
    await llenarFila(user, 1, '2026-11-02', '10:00', '14:00');

    await user.click(screen.getByRole('button', { name: 'Revisar y enviar' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText(/se enviarán por correo a tu supervisor/)).toBeInTheDocument();
    expect(cuerpos).toHaveLength(0);

    await user.click(within(dialogo).getByRole('button', { name: 'Enviar a mi supervisor' }));

    expect(await screen.findByRole('heading', { name: 'Horas enviadas' })).toBeInTheDocument();
    expect(cuerpos).toHaveLength(1);
    const [turno] = cuerpos[0]!.turnos;
    expect(turno).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      fecha: '2026-11-02',
      entrada: '10:00',
      salida: '14:00',
    });
    expect(screen.getByText('Semana del 2 al 8 de noviembre')).toBeInTheDocument();
    expect(screen.getByText('Enviada al supervisor')).toBeInTheDocument();
    expect(queryClient.getQueryState(pendientesKeys.all)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(historialKeys.semana(undefined))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(avanceKeys.detalle('x'))?.isInvalidated).toBe(true);
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/alumno');
  });

  it('RF-17a: muestra el error de cada fila junto a su turno', async () => {
    mockPost(() =>
      HttpResponse.json(
        {
          error: {
            code: 'ASISTENCIA_TRASLAPADA',
            message: 'El turno 2 se traslapa con otro turno.',
            details: [{ index: 1, code: 'ASISTENCIA_TRASLAPADA', message: 'El turno se traslapa con otro turno.' }],
          },
        },
        { status: 409 },
      ),
    );
    const { user } = renderApp('/alumno/libreta');
    await screen.findByLabelText('Fecha del turno 1');
    await llenarFila(user, 1, '2026-11-02', '08:00', '10:00');
    await user.click(screen.getByRole('button', { name: 'Agregar turno' }));
    await llenarFila(user, 2, '2026-11-02', '09:00', '11:00');
    await user.click(screen.getByRole('button', { name: 'Revisar y enviar' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Enviar a mi supervisor' }));

    const mensaje = await screen.findByText('El turno se traslapa con otro turno.');
    const fila2 = screen.getByRole('group', { name: 'Turno 2' });
    expect(fila2).toContainElement(mensaje);
    expect(screen.getByLabelText('Fecha del turno 2')).toHaveAttribute('aria-describedby', expect.stringContaining(mensaje.id));
    expect(within(screen.getByRole('group', { name: 'Turno 1' })).queryByText('El turno se traslapa con otro turno.')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Revisa los turnos marcados');
    expect(screen.queryByRole('heading', { name: 'Horas enviadas' })).not.toBeInTheDocument();
  });

  it('RF-17a: un 409 de toda la solicitud muestra el mensaje del servidor', async () => {
    mockPost(() =>
      HttpResponse.json(
        { error: { code: 'SIN_SUPERVISOR', message: 'Tu expediente aún no tiene supervisor asignado.' } },
        { status: 409 },
      ),
    );
    const { user } = renderApp('/alumno/libreta');
    await screen.findByLabelText('Fecha del turno 1');
    await llenarFila(user, 1, '2026-11-02', '08:00', '10:00');
    await user.click(screen.getByRole('button', { name: 'Revisar y enviar' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Enviar a mi supervisor' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu expediente aún no tiene supervisor asignado.');
  });

  describe('corregir una semana rechazada (PUT)', () => {
    const rechazada = (extra: Record<string, unknown> = {}) =>
      buildSemana({
        inicio: '2026-11-02',
        id: SEMANA_ID,
        estadoValidacion: 'RECHAZADA',
        comentario: 'Faltó el turno del jueves.',
        deLibreta: true,
        puedeCorregirLibreta: true,
        turnosPorDia: { '2026-11-02': [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }] },
        ...extra,
      });

    it('RF-17a: precarga los turnos de la semana y envía el PUT con sus ids', async () => {
      server.use(http.get('*/api/asistencias', () => HttpResponse.json({ semana: rechazada() })));
      const cuerpos: unknown[] = [];
      server.use(
        http.put(PUT_URL, async ({ request }) => {
          cuerpos.push(await request.json());
          return HttpResponse.json({ semana: buildSemanaLibreta() });
        }),
      );
      const { user } = renderApp('/alumno/libreta?corregir=2026-11-02');

      expect(await screen.findByRole('heading', { name: 'Corregir horas de libreta' })).toBeInTheDocument();
      expect(await screen.findByText(/Faltó el turno del jueves\./)).toBeInTheDocument();
      expect(screen.getByText('Semana del 2 al 8 de noviembre')).toBeInTheDocument();
      expect(await screen.findByLabelText('Fecha del turno 1')).toHaveValue('2026-11-02');
      expect(screen.getByLabelText('Hora de entrada del turno 1')).toHaveValue('10:00');
      expect(screen.getByLabelText('Hora de salida del turno 1')).toHaveValue('14:00');

      await user.click(screen.getByRole('button', { name: 'Agregar turno' }));
      await llenarFila(user, 2, '2026-11-05', '08:00', '09:00');
      await user.click(screen.getByRole('button', { name: 'Revisar y enviar' }));
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Enviar a mi supervisor' }));

      expect(await screen.findByRole('heading', { name: 'Horas enviadas' })).toBeInTheDocument();
      expect(cuerpos).toEqual([
        {
          turnos: [
            { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fecha: '2026-11-02', entrada: '10:00', salida: '14:00' },
            { id: expect.stringMatching(/^[0-9a-f-]{36}$/), fecha: '2026-11-05', entrada: '08:00', salida: '09:00' },
          ],
        },
      ]);
    });

    it('RF-17a: restringe las fechas a la semana corregida', async () => {
      server.use(http.get('*/api/asistencias', () => HttpResponse.json({ semana: rechazada() })));
      const { user } = renderApp('/alumno/libreta?corregir=2026-11-02');
      const fecha = await screen.findByLabelText('Fecha del turno 1');
      expect(fecha).toHaveAttribute('min', '2026-11-02');
      expect(fecha).toHaveAttribute('max', '2026-11-08');
      await user.clear(fecha);
      await user.type(fecha, '2026-10-28');
      await user.click(screen.getByRole('button', { name: 'Revisar y enviar' }));
      expect(await screen.findByText('La fecha debe estar dentro de la semana del 2 al 8 de noviembre.')).toBeInTheDocument();
    });

    it('RF-17a: si la semana no se puede corregir lo explica y no muestra el formulario', async () => {
      server.use(http.get('*/api/asistencias', () => HttpResponse.json({ semana: rechazada({ puedeCorregirLibreta: false }) })));
      renderApp('/alumno/libreta?corregir=2026-11-02');
      expect(await screen.findByText('Esta semana ya no se puede corregir.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Agregar turno' })).not.toBeInTheDocument();
    });

    it('RF-17a: el error 409 del PUT se muestra', async () => {
      server.use(
        http.get('*/api/asistencias', () => HttpResponse.json({ semana: rechazada() })),
        http.put(PUT_URL, () =>
          HttpResponse.json({ error: { code: 'SEMANA_NO_EDITABLE', message: 'La semana ya no se puede editar.' } }, { status: 409 }),
        ),
      );
      const { user } = renderApp('/alumno/libreta?corregir=2026-11-02');
      await screen.findByLabelText('Fecha del turno 1');
      await user.click(screen.getByRole('button', { name: 'Revisar y enviar' }));
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Enviar a mi supervisor' }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('La semana ya no se puede editar.'));
    });
  });
});
