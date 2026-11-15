import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAvance, buildCorreccion, buildExpediente, buildMe, buildSemana } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const RUTA = '/vinculacion/correcciones';
const SOLICITUD_ID = '77777777-7777-4777-8777-777777777777';
const EXPEDIENTE_ID = '44444444-4444-4444-8444-444444444441';
const MOTIVO = 'Olvidé registrar mi salida al terminar.';

// A row of GET /api/correcciones for the office (task 0038).
const fila = (overrides: Record<string, unknown> = {}) => ({
  ...buildCorreccion({ id: SOLICITUD_ID, motivo: MOTIVO }),
  turno: {
    id: 'turno-2026-11-10-0',
    entrada: '2026-11-10T15:00:00.000Z',
    salida: '2026-11-11T05:59:00.000Z',
    estado: 'INCOMPLETA',
    minutosAcreditables: 0,
  },
  expediente: { id: EXPEDIENTE_ID, tipo: 'SERVICIO_SOCIAL' },
  alumno: { nombre: 'Ana María López García', matricula: '25319051769999' },
  ...overrides,
});

function mockOficina() {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION' }))));
}

// Serves the queue; after a resolution the queue comes back empty. Records the PATCH bodies.
function mockCola(filas: Record<string, unknown>[], respond?: () => Response) {
  let actuales = filas;
  const cuerpos: Record<string, unknown>[] = [];
  server.use(
    http.get('*/api/correcciones', () => HttpResponse.json({ correcciones: actuales })),
    http.patch('*/api/correcciones/:id', async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>;
      cuerpos.push({ id: params.id, ...body });
      if (respond) return respond();
      actuales = [];
      return HttpResponse.json({ correccion: buildCorreccion({ estado: body.accion === 'APROBAR' ? 'APROBADA' : 'RECHAZADA' }) });
    }),
  );
  return cuerpos;
}

describe('/vinculacion/correcciones (RF-17, specs §10 pantalla 5)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T16:00:00Z'));
    mockOficina();
  });
  afterEach(() => vi.useRealTimers());

  it('is linked from the office menu', async () => {
    mockCola([]);
    renderApp('/vinculacion');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Correcciones' })).toHaveAttribute('href', RUTA);
  });

  it('shows a loading state and then the empty state', async () => {
    server.use(
      http.get('*/api/correcciones', async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ correcciones: [] });
      }),
    );
    renderApp(RUTA);
    expect(await screen.findByText('Cargando correcciones…')).toBeInTheDocument();
    expect(await screen.findByText('No hay correcciones pendientes')).toBeInTheDocument();
  });

  it('shows an error and retries', async () => {
    let llamadas = 0;
    server.use(
      http.get('*/api/correcciones', () => {
        llamadas += 1;
        return llamadas === 1
          ? HttpResponse.json({ error: { code: 'ERROR_INTERNO', message: 'Falló.' } }, { status: 500 })
          : HttpResponse.json({ correcciones: [] });
      }),
    );
    const { user } = renderApp(RUTA);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falló.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No hay correcciones pendientes')).toBeInTheDocument();
  });

  it('RF-17: each request shows the student, the shift as registered, the proposed times and the reason', async () => {
    mockCola([fila()]);
    renderApp(RUTA);

    const tarjeta = within(await screen.findByRole('article', { name: /Ana María López García/ }));
    expect(tarjeta.getByRole('link', { name: 'Ana María López García' })).toHaveAttribute('href', `/vinculacion/expedientes/${EXPEDIENTE_ID}`);
    expect(tarjeta.getByText('25319051769999')).toBeInTheDocument();
    expect(tarjeta.getByText('Turno del martes 10')).toBeInTheDocument();
    expect(tarjeta.getByText('Registrado: 09:00 – Sin salida registrada')).toBeInTheDocument();
    expect(tarjeta.getByText('Propuesto: 09:00 – 14:00')).toBeInTheDocument();
    expect(tarjeta.getByText(`Motivo del alumno: «${MOTIVO}»`)).toBeInTheDocument();
  });

  it('RF-17: approving sends APROBAR and the request leaves the queue', async () => {
    const cuerpos = mockCola([fila()]);
    const { user } = renderApp(RUTA);

    await user.click(await screen.findByRole('button', { name: 'Aprobar corrección' }));

    await waitFor(() => expect(cuerpos).toEqual([{ id: SOLICITUD_ID, accion: 'APROBAR' }]));
    expect(await screen.findByText('No hay correcciones pendientes')).toBeInTheDocument();
  });

  it('RF-17: rejecting asks for the comment the student will read', async () => {
    const cuerpos = mockCola([fila()]);
    const { user } = renderApp(RUTA);

    await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
    await user.type(screen.getByLabelText('Comentario para el alumno'), 'no');
    await user.click(screen.getByRole('button', { name: 'Rechazar corrección' }));
    expect(await screen.findByText('Escribe al menos 5 caracteres para explicar el rechazo.')).toBeInTheDocument();
    expect(cuerpos).toHaveLength(0);

    await user.type(screen.getByLabelText('Comentario para el alumno'), ' coincide con tu supervisor');
    await user.click(screen.getByRole('button', { name: 'Rechazar corrección' }));

    await waitFor(() =>
      expect(cuerpos).toEqual([{ id: SOLICITUD_ID, accion: 'RECHAZAR', comentario: 'no coincide con tu supervisor' }]),
    );
  });

  it('RF-17: shows the message of a rule the server rejects', async () => {
    mockCola([fila()], () =>
      HttpResponse.json(
        { error: { code: 'SEMANA_NO_CORREGIBLE', message: 'La semana de este turno ya se envió o se validó, por lo que no se puede corregir.' } },
        { status: 409 },
      ),
    );
    const { user } = renderApp(RUTA);

    await user.click(await screen.findByRole('button', { name: 'Aprobar corrección' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La semana de este turno ya se envió o se validó');
    expect(screen.getByRole('button', { name: 'Aprobar corrección' })).toBeEnabled();
  });
});

describe('/vinculacion/expedientes/:id: correcciones en el detalle (RF-17, RF-25, RF-29)', () => {
  const RUTA_DETALLE = `/vinculacion/expedientes/${EXPEDIENTE_ID}`;

  function mockDetalle(turno: Record<string, unknown>, entradas: unknown[] = []) {
    server.use(
      http.get(`*/api/expedientes/${EXPEDIENTE_ID}`, () =>
        HttpResponse.json({
          expediente: buildExpediente({
            id: EXPEDIENTE_ID,
            estado: 'EN_PROCESO',
            faltantes: [],
            alumno: {
              id: '88888888-8888-4888-8888-888888888881',
              nombre: 'Ana María',
              apellidoPaterno: 'López',
              apellidoMaterno: 'García',
              matricula: '25319051769999',
              carrera: 'Programación',
              semestre: 5,
              grupo: 'A',
              turno: 'MATUTINO',
            },
          }),
        }),
      ),
      http.get(`*/api/expedientes/${EXPEDIENTE_ID}/avance`, () => HttpResponse.json({ avance: buildAvance({ expedienteId: EXPEDIENTE_ID }) })),
      http.get(`*/api/expedientes/${EXPEDIENTE_ID}/auditoria`, () => HttpResponse.json({ limite: 200, truncado: false, entradas })),
      http.get('*/api/asistencias', () =>
        HttpResponse.json({ semana: buildSemana({ inicio: '2026-11-09', turnosPorDia: { '2026-11-10': [turno] } }) }),
      ),
    );
  }

  const turnoIncompleto = (correccion: unknown) => ({
    entrada: '2026-11-10T15:00:00.000Z',
    salida: '2026-11-11T05:59:00.000Z',
    estado: 'INCOMPLETA',
    minutosAcreditables: 0,
    correccion,
    puedeSolicitarCorreccion: false,
  });

  const turnoItem = async () =>
    within(await screen.findByRole('region', { name: 'martes 10' })).getAllByRole('listitem')[0]!;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T16:00:00Z'));
    mockOficina();
  });
  afterEach(() => vi.useRealTimers());

  it('RF-17: a pending request is shown on its shift and can be resolved there', async () => {
    mockDetalle(turnoIncompleto(buildCorreccion({ id: SOLICITUD_ID, motivo: MOTIVO })));
    const cuerpos = mockCola([]);
    const { user } = renderApp(RUTA_DETALLE);

    const item = within(await turnoItem());
    expect(item.getByText('Corrección solicitada: 09:00 – 14:00')).toBeInTheDocument();
    expect(item.getByText(`Motivo del alumno: «${MOTIVO}»`)).toBeInTheDocument();
    expect(item.queryByRole('button', { name: 'Solicitar corrección' })).not.toBeInTheDocument();

    await user.click(item.getByRole('button', { name: 'Aprobar corrección' }));
    await waitFor(() => expect(cuerpos).toEqual([{ id: SOLICITUD_ID, accion: 'APROBAR' }]));
  });

  it('RF-17: a rejected request shows the comment sent to the student', async () => {
    mockDetalle(turnoIncompleto(buildCorreccion({ estado: 'RECHAZADA', comentario: 'Tu supervisor no lo confirma.' })));
    renderApp(RUTA_DETALLE);

    const item = within(await turnoItem());
    expect(item.getByText('Corrección rechazada')).toBeInTheDocument();
    expect(item.getByText('Comentario para el alumno: «Tu supervisor no lo confirma.»')).toBeInTheDocument();
    expect(item.queryByRole('button', { name: 'Aprobar corrección' })).not.toBeInTheDocument();
  });

  it('RF-29: the audit log names corrections and shows the changed times', async () => {
    mockDetalle(turnoIncompleto(null), [
      {
        id: 'a1',
        fecha: '2026-11-12T16:00:00.000Z',
        usuario: 'Laura Pérez',
        accion: 'CORREGIR_ASISTENCIA',
        entidad: 'Asistencia',
        antes: { entrada: '2026-11-10T15:00:00.000Z', salida: '2026-11-11T05:59:00.000Z', estado: 'INCOMPLETA', minutosAcreditables: 0 },
        despues: {
          entrada: '2026-11-10T15:00:00.000Z',
          salida: '2026-11-10T20:00:00.000Z',
          estado: 'CERRADA',
          minutosAcreditables: 300,
          solicitudId: SOLICITUD_ID,
          motivo: MOTIVO,
        },
      },
      {
        id: 'a2',
        fecha: '2026-11-12T15:00:00.000Z',
        usuario: 'Laura Pérez',
        accion: 'RECHAZAR_CORRECCION',
        entidad: 'SolicitudCorreccion',
        antes: { estado: 'PENDIENTE' },
        despues: { estado: 'RECHAZADA', comentario: 'No coincide.', asistenciaId: 'turno-1' },
      },
    ]);
    renderApp(RUTA_DETALLE);

    const auditoria = within(await screen.findByRole('region', { name: 'Auditoría' }));
    const filas = await auditoria.findAllByRole('row');
    const corregida = within(filas[1]!);
    expect(corregida.getByText('Turno corregido (corrección aprobada)')).toBeInTheDocument();
    expect(corregida.getByText('Turno')).toBeInTheDocument();
    expect(corregida.getByText('Salida: martes 10 23:59 → martes 10 14:00')).toBeInTheDocument();
    expect(corregida.getByText('Estado: Incompleta → Cerrada')).toBeInTheDocument();
    expect(corregida.getByText('Minutos acreditables: 0 → 300')).toBeInTheDocument();
    expect(corregida.queryByText(/solicitudId/)).not.toBeInTheDocument();

    const rechazada = within(filas[2]!);
    expect(rechazada.getByText('Corrección de turno rechazada')).toBeInTheDocument();
    expect(rechazada.getByText('Solicitud de corrección')).toBeInTheDocument();
    expect(rechazada.queryByText(/asistenciaId/)).not.toBeInTheDocument();
  });
});
