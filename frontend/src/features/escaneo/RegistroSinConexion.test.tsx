import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAvance, buildExpedienteActivo, buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';
import { crearColaEnMemoria } from '../../offline/almacenamientoMemoria';
import { encolarRegistro } from '../../offline/cola';
import { guardarUltimaSesion } from '../auth/sesionLocal';
import type { QrScannerOptions, QrScannerState } from './hooks/useQrScanner';

vi.mock('./hooks/useQrScanner', async () => {
  const React = await import('react');
  return {
    useQrScanner: (_options: QrScannerOptions): QrScannerState =>
      ({ videoRef: React.createRef<HTMLVideoElement>(), estado: 'escaneando' }) as QrScannerState,
  };
});

const URL_ESCANEO = '*/api/asistencias/escaneo';
const ENTRADA_ISO = '2026-11-11T16:11:00.000Z';

function respuesta() {
  return {
    tipo: 'ENTRADA',
    asistencia: { id: 'a1', entrada: ENTRADA_ISO, salida: null, estado: 'ABIERTA', minutosAcreditables: 0, sinConexion: true },
    minutosDia: 0,
    minutosAcreditablesDia: 0,
    excedente: 0,
  };
}

type Body = { id: string; codigoCorto?: string; token?: string; hora?: string; sinConexion: boolean };

function mockEscaneo(reply: (body: Body) => Response | Promise<Response>) {
  const bodies: Body[] = [];
  server.use(
    http.post(URL_ESCANEO, async ({ request }) => {
      const body = (await request.json()) as Body;
      bodies.push(body);
      return reply(body);
    }),
  );
  return bodies;
}

function mockAlumno() {
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ expedienteActivo: buildExpedienteActivo() }))),
    http.get('*/api/expedientes/:id/avance', () => HttpResponse.json({ avance: buildAvance() })),
    http.get('*/api/expedientes/:id', () => HttpResponse.json({ expediente: { faltantes: [] } })),
  );
}

function ponerSinRed() {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
}

async function registrarConCodigo(ctx: ReturnType<typeof renderApp>, codigo = 'ABC234') {
  await ctx.user.click(await screen.findByRole('button', { name: 'Escribir el código' }));
  await ctx.user.type(screen.getByLabelText('Código de la institución'), codigo);
  await ctx.user.click(screen.getByRole('button', { name: 'Registrar' }));
}

beforeEach(() => mockAlumno());
afterEach(() => vi.restoreAllMocks());

describe('/alumno/registrar sin conexión (RF-16, RN-14)', () => {
  it('RF-16: sin conexión guarda el registro con el código corto y avisa que está pendiente', async () => {
    const bodies = mockEscaneo(() => HttpResponse.json(respuesta(), { status: 201 }));
    const ctx = renderApp('/alumno/registrar');
    await screen.findByRole('button', { name: 'Escribir el código' });
    ponerSinRed();
    await registrarConCodigo(ctx);

    expect(await screen.findByText('Registro guardado. Pendiente de sincronizar.')).toBeInTheDocument();
    expect(screen.getByText(/se enviará solo cuando tengas conexión/i)).toBeInTheDocument();
    expect(screen.queryByText(/Entrada registrada|Salida registrada/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/alumno');
    expect(bodies).toHaveLength(0);
    const guardados = await ctx.cola.listar();
    expect(guardados).toHaveLength(1);
    expect(guardados[0]).toMatchObject({ codigoCorto: 'ABC234', sinConexion: true, estado: { tipo: 'PENDIENTE' } });
    expect(guardados[0]?.hora).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('RF-16: un error de red guarda el registro con el mismo id del intento y no dice si es entrada o salida', async () => {
    const bodies = mockEscaneo(() => HttpResponse.error());
    const ctx = renderApp('/alumno/registrar');
    await registrarConCodigo(ctx);

    expect(await screen.findByText('Registro guardado. Pendiente de sincronizar.')).toBeInTheDocument();
    expect(screen.queryByText('No hay conexión. Intenta de nuevo.')).not.toBeInTheDocument();
    expect(bodies).toHaveLength(1);
    const guardados = await ctx.cola.listar();
    expect(guardados).toHaveLength(1);
    expect(guardados[0]?.id).toBe(bodies[0]?.id);
    expect(guardados[0]).toMatchObject({ codigoCorto: 'ABC234', sinConexion: true });
  });

  it('RF-16: un error de la API no se guarda y muestra el mensaje', async () => {
    mockEscaneo(() =>
      HttpResponse.json({ error: { code: 'QR_NO_ENCONTRADO', message: 'Ese código no existe.' } }, { status: 404 }),
    );
    const ctx = renderApp('/alumno/registrar');
    await registrarConCodigo(ctx);

    expect(await screen.findByText('Ese código no existe.')).toBeInTheDocument();
    expect(screen.queryByText(/Pendiente de sincronizar/)).not.toBeInTheDocument();
    expect(await ctx.cola.listar()).toHaveLength(0);
  });

  it('RF-16: con una sesión conocida y sin conexión se puede abrir Registrar y guardar con el código corto', async () => {
    guardarUltimaSesion({ id: 'user-1', nombre: 'Ana María López García', rol: 'ALUMNO' });
    server.use(http.get('*/api/me', () => HttpResponse.error()));
    ponerSinRed();
    const ctx = renderApp('/alumno/registrar');
    await registrarConCodigo(ctx);

    expect(await screen.findByText('Registro guardado. Pendiente de sincronizar.')).toBeInTheDocument();
    expect(await ctx.cola.listar()).toHaveLength(1);
  });
});

describe('sincronización del alumno (RF-16, RN-14)', () => {
  it('RF-16: al abrir la app envía los pendientes, refresca los datos y el contador desaparece', async () => {
    const cola = crearColaEnMemoria();
    const pendiente = await encolarRegistro(cola, { codigoCorto: 'ABC234' }, 'user-1', new Date(Date.now() - 60_000));
    const bodies = mockEscaneo(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return HttpResponse.json(respuesta());
    });
    const ctx = renderApp('/alumno', { cola });
    const spy = vi.spyOn(ctx.queryClient, 'invalidateQueries');

    expect(await screen.findByText('1 registro pendiente de sincronizar')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('1 registro pendiente de sincronizar')).not.toBeInTheDocument());

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ id: pendiente.id, codigoCorto: 'ABC234', sinConexion: true, hora: pendiente.hora });
    expect(await cola.listar()).toHaveLength(0);
    await waitFor(() => {
      const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
      expect(keys).toContain(JSON.stringify(['avance']));
      expect(keys).toContain(JSON.stringify(['historial']));
      expect(keys).toContain(JSON.stringify(['pendientes']));
    });
  });

  it('RF-16: usa el plural con varios pendientes', async () => {
    const cola = crearColaEnMemoria();
    await encolarRegistro(cola, { codigoCorto: 'ABC234' }, 'user-1', new Date(Date.now() - 60_000));
    await encolarRegistro(cola, { codigoCorto: 'ABC234' }, 'user-1', new Date(Date.now() - 30_000));
    mockEscaneo(() => HttpResponse.error());
    renderApp('/alumno', { cola });

    expect(await screen.findByText('2 registros pendientes de sincronizar')).toBeInTheDocument();
  });

  it('RF-16: al volver la conexión (evento online) envía los pendientes', async () => {
    const cola = crearColaEnMemoria();
    await encolarRegistro(cola, { codigoCorto: 'ABC234' }, 'user-1', new Date(Date.now() - 60_000));
    let hayRed = false;
    const bodies = mockEscaneo(() => (hayRed ? HttpResponse.json(respuesta()) : HttpResponse.error()));
    renderApp('/alumno', { cola });

    expect(await screen.findByText('1 registro pendiente de sincronizar')).toBeInTheDocument();
    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() => expect(screen.getByText('1 registro pendiente de sincronizar')).toBeInTheDocument());

    hayRed = true;
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(screen.queryByText('1 registro pendiente de sincronizar')).not.toBeInTheDocument());
    expect(bodies).toHaveLength(2);
    expect(await cola.listar()).toHaveLength(0);
  });

  it('RF-16: si la sesión expiró avisa que hay que iniciar sesión y conserva el registro', async () => {
    const cola = crearColaEnMemoria();
    await encolarRegistro(cola, { codigoCorto: 'ABC234' }, 'user-1', new Date(Date.now() - 60_000));
    mockEscaneo(() =>
      HttpResponse.json({ error: { code: 'NO_AUTENTICADO', message: 'Debes iniciar sesión.' } }, { status: 401 }),
    );
    renderApp('/alumno', { cola });

    expect(await screen.findByText('Inicia sesión para enviar tus registros pendientes.')).toBeInTheDocument();
    expect(screen.getByText('1 registro pendiente de sincronizar')).toBeInTheDocument();
    expect(await cola.listar()).toHaveLength(1);
  });

  it('RN-14: muestra el registro rechazado con el mensaje del servidor y se puede descartar', async () => {
    const cola = crearColaEnMemoria();
    // 2026-11-11 16:11 UTC = 10:11 in Monterrey, whatever the device time zone.
    const rechazado = await encolarRegistro(cola, { codigoCorto: 'ABC234' }, 'user-1', new Date('2026-11-11T16:11:00Z'));
    mockEscaneo(() =>
      HttpResponse.json(
        {
          error: {
            code: 'HORA_ANTIGUA',
            message: 'El registro tiene más de 72 horas. Solicita una corrección a tu oficina.',
          },
        },
        { status: 422 },
      ),
    );
    const ctx = renderApp('/alumno', { cola });

    const mensaje = await screen.findByText('El registro tiene más de 72 horas. Solicita una corrección a tu oficina.');
    const item = mensaje.closest('li');
    expect(item).not.toBeNull();
    expect(within(item as HTMLElement).getByText(/miércoles 11 de noviembre/)).toBeInTheDocument();
    expect(within(item as HTMLElement).getByText(/10:11/)).toBeInTheDocument();
    expect(screen.queryByText(/pendiente de sincronizar/)).not.toBeInTheDocument();

    await ctx.user.click(within(item as HTMLElement).getByRole('button', { name: 'Descartar' }));

    await waitFor(() => expect(screen.queryByText(/más de 72 horas/)).not.toBeInTheDocument());
    expect(await cola.listar()).toHaveLength(0);
    expect(rechazado.id).toBeTruthy();
  });
});

describe('registros de otro usuario (RF-16, integridad)', () => {
  it('RF-16: el contador y los rechazados muestran solo los del usuario actual, y no envía los ajenos', async () => {
    const cola = crearColaEnMemoria();
    await encolarRegistro(cola, { codigoCorto: 'ABC234' }, 'user-1', new Date(Date.now() - 60_000));
    const ajeno = await encolarRegistro(cola, { codigoCorto: 'ZZZ999' }, 'otro-usuario', new Date(Date.now() - 50_000));
    const ajenoRechazado = await encolarRegistro(cola, { codigoCorto: 'YYY888' }, 'otro-usuario', new Date(Date.now() - 40_000));
    await cola.marcarRechazado(ajenoRechazado.id, { code: 'X', message: 'Mensaje de otro alumno' });
    const bodies = mockEscaneo(() => HttpResponse.error());
    renderApp('/alumno', { cola });

    expect(await screen.findByText('1 registro pendiente de sincronizar')).toBeInTheDocument();
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.codigoCorto).toBe('ABC234');
    expect(screen.queryByText('Mensaje de otro alumno')).not.toBeInTheDocument();
    expect((await cola.listar()).map((r) => r.id)).toContain(ajeno.id);
  });

  it('RF-16: sin id de usuario conocido no guarda el registro y pide iniciar sesión', async () => {
    const base = buildMe({ expedienteActivo: buildExpedienteActivo() });
    server.use(http.get('*/api/me', () => HttpResponse.json({ ...base, usuario: { ...base.usuario, id: '' } })));
    mockEscaneo(() => HttpResponse.error());
    const ctx = renderApp('/alumno/registrar');
    await registrarConCodigo(ctx);

    expect(await screen.findByText(/Inicia sesión para guardar tu registro/)).toBeInTheDocument();
    expect(await ctx.cola.listar()).toHaveLength(0);
  });
});

describe('inicio sin conexión (RF-16, RF-18)', () => {
  it('RF-16: sin conexión muestra "Sin conexión" y los pendientes, y deja el botón Registrar visible', async () => {
    const cola = crearColaEnMemoria();
    await encolarRegistro(cola, { codigoCorto: 'ABC234' }, 'user-1');
    guardarUltimaSesion({ id: 'user-1', nombre: 'Ana María López García', rol: 'ALUMNO' });
    server.use(http.get('*/api/me', () => HttpResponse.error()));
    ponerSinRed();
    renderApp('/alumno', { cola });

    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    expect(await screen.findByText('1 registro pendiente de sincronizar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar' })).toHaveAttribute('href', '/alumno/registrar');
  });
});
