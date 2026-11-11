import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAvance, buildExpedienteActivo, buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';
import type { QrScannerOptions, QrScannerState } from './hooks/useQrScanner';

const scanner = vi.hoisted(() => ({
  options: null as null | { onResult: (text: string) => void },
  state: { estado: 'escaneando' } as { estado: string; motivo?: string },
}));

vi.mock('./hooks/useQrScanner', async () => {
  const React = await import('react');
  return {
    useQrScanner: (options: QrScannerOptions): QrScannerState => {
      scanner.options = options;
      return { videoRef: React.createRef<HTMLVideoElement>(), ...scanner.state } as QrScannerState;
    },
  };
});

const TOKEN = 'k3Jx9_aB-0123456789abcdefghijklmnopqrstuvwxy';
const URL_ESCANEO = '*/api/asistencias/escaneo';
const ENTRADA_ISO = '2026-11-11T16:11:00.000Z'; // 10:11 in Monterrey
const SALIDA_ISO = '2026-11-11T22:18:00.000Z'; // 16:18 in Monterrey

function respuesta(overrides: Record<string, unknown> = {}) {
  return {
    tipo: 'ENTRADA',
    asistencia: {
      id: 'a1',
      entrada: ENTRADA_ISO,
      salida: null,
      estado: 'ABIERTA',
      minutosAcreditables: 0,
      sinConexion: false,
    },
    minutosDia: 0,
    minutosAcreditablesDia: 0,
    excedente: 0,
    ...overrides,
  };
}

function respuestaSalida(overrides: Record<string, unknown> = {}, asistencia: Record<string, unknown> = {}) {
  return respuesta({
    tipo: 'SALIDA',
    asistencia: {
      id: 'a1',
      entrada: ENTRADA_ISO,
      salida: SALIDA_ISO,
      estado: 'CERRADA',
      minutosAcreditables: 200,
      sinConexion: false,
      ...asistencia,
    },
    minutosDia: 200,
    minutosAcreditablesDia: 200,
    ...overrides,
  });
}

type Body = { id: string; token?: string; codigoCorto?: string; sinConexion: boolean };

function mockEscaneo(reply: () => Response | Promise<Response>) {
  const bodies: Body[] = [];
  server.use(
    http.post(URL_ESCANEO, async ({ request }) => {
      bodies.push((await request.json()) as Body);
      return reply();
    }),
  );
  return bodies;
}

function mockAlumno() {
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ expedienteActivo: buildExpedienteActivo() }))),
    http.get('*/api/expedientes/:id/avance', () => HttpResponse.json({ avance: buildAvance() })),
  );
}

async function abrirModoCodigo() {
  const ctx = renderApp('/alumno/registrar');
  await ctx.user.click(await screen.findByRole('button', { name: 'Escribir el código' }));
  return ctx;
}

async function escribirYEnviar(ctx: Awaited<ReturnType<typeof abrirModoCodigo>>, codigo: string) {
  await ctx.user.type(screen.getByLabelText('Código de la institución'), codigo);
  await ctx.user.click(screen.getByRole('button', { name: 'Registrar' }));
}

beforeEach(() => {
  scanner.options = null;
  scanner.state = { estado: 'escaneando' };
  mockAlumno();
});

describe('/alumno/registrar, modo código (RF-14, RF-15)', () => {
  it('RF-14: registra una entrada con el código corto en mayúsculas', async () => {
    const bodies = mockEscaneo(() => HttpResponse.json(respuesta(), { status: 201 }));
    const ctx = await abrirModoCodigo();
    await escribirYEnviar(ctx, 'abc234');

    expect(await screen.findByText('Entrada registrada a las 10:11')).toBeInTheDocument();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ codigoCorto: 'ABC234', sinConexion: false });
    expect(bodies[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(bodies[0]).not.toHaveProperty('token');
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/alumno');
  });

  it('RF-14: registra una salida y muestra las horas acreditadas del día', async () => {
    mockEscaneo(() => HttpResponse.json(respuestaSalida()));
    const ctx = await abrirModoCodigo();
    await escribirYEnviar(ctx, 'ABC234');

    expect(await screen.findByText('Salida registrada a las 16:18')).toBeInTheDocument();
    expect(screen.getByText('Hoy llevas 3 h 20 min acreditadas')).toBeInTheDocument();
  });

  it('RN-04: avisa el excedente del tope diario', async () => {
    mockEscaneo(() =>
      HttpResponse.json(respuestaSalida({ minutosDia: 360, minutosAcreditablesDia: 300, excedente: 60 })),
    );
    const ctx = await abrirModoCodigo();
    await escribirYEnviar(ctx, 'ABC234');

    expect(await screen.findByText('Hoy llevas 5 h acreditadas')).toBeInTheDocument();
    expect(screen.getByText('Solo se acreditan 5 h por día; 1 h no cuentan')).toBeInTheDocument();
  });

  it('RN-09: avisa que un turno de menos de 15 minutos no se acredita', async () => {
    mockEscaneo(() =>
      HttpResponse.json(respuestaSalida({ minutosDia: 0, minutosAcreditablesDia: 0 }, { minutosAcreditables: 0 })),
    );
    const ctx = await abrirModoCodigo();
    await escribirYEnviar(ctx, 'ABC234');

    expect(await screen.findByText('El turno duró menos de 15 minutos y no se acredita')).toBeInTheDocument();
  });

  it('no avisa excedente ni turno corto en una entrada', async () => {
    mockEscaneo(() => HttpResponse.json(respuesta(), { status: 201 }));
    const ctx = await abrirModoCodigo();
    await escribirYEnviar(ctx, 'ABC234');

    await screen.findByText('Entrada registrada a las 10:11');
    expect(screen.queryByText(/no se acredita/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Solo se acreditan/)).not.toBeInTheDocument();
  });

  it('valida el código antes de enviar', async () => {
    const bodies = mockEscaneo(() => HttpResponse.json(respuesta(), { status: 201 }));
    const ctx = await abrirModoCodigo();
    await escribirYEnviar(ctx, 'AB');

    expect(await screen.findByText('El código tiene 6 caracteres.')).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it('muestra el mensaje de la API y permite intentar de nuevo', async () => {
    mockEscaneo(() =>
      HttpResponse.json(
        { error: { code: 'QR_NO_ENCONTRADO', message: 'Ese código no corresponde a ninguna institución.' } },
        { status: 404 },
      ),
    );
    const ctx = await abrirModoCodigo();
    await escribirYEnviar(ctx, 'ABC234');

    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByText('Ese código no corresponde a ninguna institución.')).toBeInTheDocument();
    await ctx.user.click(within(alerta).getByRole('button', { name: 'Intentar de nuevo' }));
    expect(screen.getByLabelText('Código de la institución')).toBeInTheDocument();
  });

  it('muestra "Registrando…" y deshabilita el botón mientras envía', async () => {
    mockEscaneo(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return HttpResponse.json(respuesta(), { status: 201 });
    });
    const ctx = await abrirModoCodigo();
    await escribirYEnviar(ctx, 'ABC234');

    expect(await screen.findByRole('button', { name: 'Registrando…' })).toBeDisabled();
    expect(await screen.findByText('Entrada registrada a las 10:11')).toBeInTheDocument();
  });

  it('refresca el inicio al terminar (invalida me y avance)', async () => {
    mockEscaneo(() => HttpResponse.json(respuesta(), { status: 201 }));
    const ctx = await abrirModoCodigo();
    const spy = vi.spyOn(ctx.queryClient, 'invalidateQueries');
    await escribirYEnviar(ctx, 'ABC234');
    await screen.findByText('Entrada registrada a las 10:11');

    await waitFor(() => {
      const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
      expect(keys).toContain(JSON.stringify(['me']));
      expect(keys).toContain(JSON.stringify(['avance']));
    });
  });

  it('cambia entre modo código y cámara', async () => {
    const ctx = await abrirModoCodigo();
    await ctx.user.click(screen.getByRole('button', { name: 'Usar la cámara' }));
    expect(screen.getByRole('button', { name: 'Escribir el código' })).toBeInTheDocument();
  });
});

describe('/alumno/registrar, modo cámara (RF-14)', () => {
  it('envía el token del QR leído', async () => {
    const bodies = mockEscaneo(() => HttpResponse.json(respuesta(), { status: 201 }));
    renderApp('/alumno/registrar');
    await screen.findByRole('button', { name: 'Escribir el código' });

    scanner.options?.onResult(`https://praxis.example.com/s/${TOKEN}`);

    expect(await screen.findByText('Entrada registrada a las 10:11')).toBeInTheDocument();
    expect(bodies[0]).toMatchObject({ token: TOKEN, sinConexion: false });
    expect(bodies[0]).not.toHaveProperty('codigoCorto');
    expect(screen.queryByText(TOKEN)).not.toBeInTheDocument();
  });

  it('muestra un mensaje con un QR ajeno y no llama a la API', async () => {
    const bodies = mockEscaneo(() => HttpResponse.json(respuesta(), { status: 201 }));
    renderApp('/alumno/registrar');
    await screen.findByRole('button', { name: 'Escribir el código' });

    scanner.options?.onResult('https://example.com/otra');

    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByText('Este código QR no es de Praxis')).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it('pasa al modo código con un mensaje si se niega el permiso de cámara', async () => {
    scanner.state = { estado: 'error', motivo: 'permiso' };
    renderApp('/alumno/registrar');

    expect(await screen.findByLabelText('Código de la institución')).toBeInTheDocument();
    expect(screen.getByText(/No diste permiso para usar la cámara/)).toBeInTheDocument();
  });

  it('pasa al modo código si no hay cámara', async () => {
    scanner.state = { estado: 'error', motivo: 'sin-camara' };
    renderApp('/alumno/registrar');

    expect(await screen.findByLabelText('Código de la institución')).toBeInTheDocument();
    expect(screen.getByText(/No encontramos una cámara/)).toBeInTheDocument();
  });
});

describe('/alumno/registrar, error de red (idempotencia de la 0014)', () => {
  it('reintenta con el mismo id tras un error de red', async () => {
    let fallar = true;
    const bodies = mockEscaneo(() => {
      if (fallar) return HttpResponse.error();
      return HttpResponse.json(respuesta(), { status: 201 });
    });
    const ctx = await abrirModoCodigo();
    await escribirYEnviar(ctx, 'ABC234');

    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByText('No hay conexión. Intenta de nuevo.')).toBeInTheDocument();

    fallar = false;
    await ctx.user.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Entrada registrada a las 10:11')).toBeInTheDocument();

    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.id).toBe(bodies[0]?.id);
  });

  it('un envío nuevo genera un id distinto', async () => {
    const bodies = mockEscaneo(() =>
      HttpResponse.json({ error: { code: 'QR_NO_ENCONTRADO', message: 'No existe.' } }, { status: 404 }),
    );
    const ctx = await abrirModoCodigo();
    await escribirYEnviar(ctx, 'ABC234');
    await ctx.user.click(await screen.findByRole('button', { name: 'Intentar de nuevo' }));
    await ctx.user.type(screen.getByLabelText('Código de la institución'), 'ABC234');
    await ctx.user.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(bodies).toHaveLength(2));

    expect(bodies[1]?.id).not.toBe(bodies[0]?.id);
  });
});
