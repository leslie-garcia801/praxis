import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { EscaneoRequest, EscaneoResponse } from '@/features/escaneo/api';
import { crearColaEnMemoria } from './almacenamientoMemoria';
import { descartarRechazado, encolarRegistro } from './cola';
import { sincronizarPendientes } from './sincronizar';

const RESPUESTA = { tipo: 'ENTRADA' } as EscaneoResponse;

function reloj(minutos: number): Date {
  return new Date(Date.UTC(2026, 10, 16, 14, minutos));
}

async function colaConTres() {
  const cola = crearColaEnMemoria();
  const a = await encolarRegistro(cola, { token: 'tok-a' }, 'user-1', reloj(0));
  const b = await encolarRegistro(cola, { codigoCorto: 'ABC123' }, 'user-1', reloj(1));
  const c = await encolarRegistro(cola, { token: 'tok-c' }, 'user-1', reloj(2));
  return { cola, a, b, c };
}

describe('encolarRegistro', () => {
  it('RF-16: crea un registro con uuid, sinConexion y la hora del dispositivo con zona', async () => {
    const cola = crearColaEnMemoria();
    const ahora = reloj(30);

    const registro = await encolarRegistro(cola, { token: 'tok' }, 'user-1', ahora);

    expect(registro.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(registro).toMatchObject({ token: 'tok', sinConexion: true, estado: { tipo: 'PENDIENTE' } });
    expect(registro.hora).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/);
    expect(new Date(registro.hora).getTime()).toBe(ahora.getTime());
    expect(await cola.listar()).toEqual([registro]);
  });
});

describe('encolarRegistro con id propio', () => {
  it('RF-16: conserva el id del intento en línea que falló por red, para que el envío sea idempotente', async () => {
    const cola = crearColaEnMemoria();
    const id = '11111111-2222-4333-8444-555555555555';
    const ahora = reloj(45);

    const registro = await encolarRegistro(cola, { codigoCorto: 'ABC234' }, 'user-1', ahora, id);

    expect(registro.id).toBe(id);
    expect(registro.hora).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(registro.hora).getTime()).toBe(ahora.getTime());
    expect((await cola.listar())[0]?.id).toBe(id);
  });
});

describe('registros de cada usuario (RF-16, integridad)', () => {
  it('RF-16: el registro guarda el usuarioId de quien lo encoló', async () => {
    const cola = crearColaEnMemoria();
    const registro = await encolarRegistro(cola, { token: 'tok' }, 'user-7', reloj(0));
    expect(registro.usuarioId).toBe('user-7');
    expect((await cola.listar())[0]?.usuarioId).toBe('user-7');
  });

  it('RF-16: solo envía los registros del usuario actual y deja intactos los de otros', async () => {
    const cola = crearColaEnMemoria();
    const mio = await encolarRegistro(cola, { token: 'mio' }, 'user-1', reloj(0));
    const ajeno = await encolarRegistro(cola, { token: 'ajeno' }, 'user-2', reloj(1));
    const enviar = vi.fn(async (_request: EscaneoRequest) => RESPUESTA);

    const resumen = await sincronizarPendientes(cola, enviar, 'user-1');

    expect(enviar.mock.calls.map(([r]) => r.id)).toEqual([mio.id]);
    expect(resumen).toMatchObject({ enviados: 1, restantes: 0 });
    expect(await cola.listar()).toEqual([ajeno]);

    await sincronizarPendientes(cola, enviar, 'user-2');
    expect(enviar.mock.calls.map(([r]) => r.id)).toEqual([mio.id, ajeno.id]);
    expect(await cola.listar()).toEqual([]);
  });

  it('RF-16: un registro sin usuarioId no se envía nunca y se descarta en la siguiente sincronización', async () => {
    const cola = crearColaEnMemoria();
    const propio = await encolarRegistro(cola, { token: 'mio' }, 'user-1', reloj(1));
    const viejo = await encolarRegistro(cola, { token: 'viejo' }, 'user-1', reloj(0));
    await cola.eliminar(viejo.id);
    const sinUsuario: Partial<typeof viejo> = { ...viejo };
    delete sinUsuario.usuarioId;
    await cola.agregar(sinUsuario as typeof viejo);
    const enviar = vi.fn(async (_request: EscaneoRequest) => RESPUESTA);

    await sincronizarPendientes(cola, enviar, 'user-1');

    expect(enviar.mock.calls.map(([r]) => r.id)).toEqual([propio.id]);
    expect(await cola.listar()).toEqual([]);
  });
});

describe('sincronizarPendientes', () => {
  it('RF-16: envía los registros del más antiguo al más nuevo, uno a la vez, y los quita al terminar', async () => {
    const { cola, a, b, c } = await colaConTres();
    const orden: string[] = [];
    let enVuelo = 0;
    const enviar = vi.fn(async (request: EscaneoRequest) => {
      enVuelo += 1;
      expect(enVuelo).toBe(1);
      orden.push(request.id);
      await Promise.resolve();
      enVuelo -= 1;
      return RESPUESTA;
    });

    const resumen = await sincronizarPendientes(cola, enviar, 'user-1');

    expect(orden).toEqual([a.id, b.id, c.id]);
    expect(resumen).toEqual({ enviados: 3, rechazados: 0, restantes: 0 });
    expect(await cola.listar()).toEqual([]);
  });

  it('RF-16: envía solo los campos del contrato con sinConexion y la hora capturada', async () => {
    const cola = crearColaEnMemoria();
    const r = await encolarRegistro(cola, { codigoCorto: 'XYZ' }, 'user-1', reloj(5));
    const enviar = vi.fn(async () => RESPUESTA);

    await sincronizarPendientes(cola, enviar, 'user-1');

    expect(enviar).toHaveBeenCalledWith({ id: r.id, codigoCorto: 'XYZ', hora: r.hora, sinConexion: true });
  });

  it('RF-16: un 200 (el servidor ya tenía el registro) también lo quita de la cola', async () => {
    // The endpoint is idempotent by id: a replay returns the existing record with 200.
    const { cola } = await colaConTres();

    const resumen = await sincronizarPendientes(cola, async () => RESPUESTA, 'user-1');

    expect(resumen.enviados).toBe(3);
    expect(await cola.listar()).toHaveLength(0);
  });

  it('RN-14: un 409 por más de 72 h marca el registro como rechazado con su mensaje y sigue con el siguiente', async () => {
    const { cola, a, b, c } = await colaConTres();
    const mensaje = 'El registro tiene más de 72 horas y ya no se puede enviar.';
    const enviar = vi.fn(async (request: EscaneoRequest) => {
      if (request.id === a.id) throw new ApiError(409, 'REGISTRO_CADUCADO', mensaje);
      return RESPUESTA;
    });

    const resumen = await sincronizarPendientes(cola, enviar, 'user-1');

    expect(enviar).toHaveBeenCalledTimes(3);
    expect(resumen).toEqual({ enviados: 2, rechazados: 1, restantes: 0 });
    const restantes = await cola.listar();
    expect(restantes.map((r) => r.id)).toEqual([a.id]);
    expect(restantes[0]?.estado).toEqual({ tipo: 'RECHAZADO', code: 'REGISTRO_CADUCADO', message: mensaje });
    expect([b.id, c.id]).not.toContain(restantes[0]?.id);
  });

  it.each([400, 403, 404])('RF-16: un %i es un rechazo definitivo', async (status) => {
    const cola = crearColaEnMemoria();
    await encolarRegistro(cola, { token: 'x' }, 'user-1', reloj(0));

    const resumen = await sincronizarPendientes(cola, async () => {
      throw new ApiError(status, 'CODIGO', 'Mensaje');
    }, 'user-1');

    expect(resumen.rechazados).toBe(1);
    expect((await cola.listar())[0]?.estado.tipo).toBe('RECHAZADO');
  });

  it('RF-16: los registros rechazados no se vuelven a enviar', async () => {
    const { cola, a } = await colaConTres();
    await cola.marcarRechazado(a.id, { code: 'X', message: 'Y' });
    const enviar = vi.fn(async () => RESPUESTA);

    const resumen = await sincronizarPendientes(cola, enviar, 'user-1');

    expect(enviar).toHaveBeenCalledTimes(2);
    expect(enviar).not.toHaveBeenCalledWith(expect.objectContaining({ id: a.id }));
    expect(resumen.enviados).toBe(2);
  });

  it.each([
    ['un error de red', () => new TypeError('Failed to fetch'), 'RED'],
    ['un 500', () => new ApiError(500, 'ERROR_INTERNO', 'Error'), 'SERVIDOR'],
    ['un 401 (sesión vencida)', () => new ApiError(401, 'NO_AUTENTICADO', 'Inicia sesión'), 'SESION'],
    ['un 408', () => new ApiError(408, 'TIMEOUT', 'Tiempo agotado'), 'LIMITE'],
    ['un 429', () => new ApiError(429, 'DEMASIADAS', 'Demasiadas solicitudes'), 'LIMITE'],
  ])('RF-16: %s conserva el registro y detiene la corrida sin tocar los siguientes', async (_n, crearError, motivo) => {
    const { cola, a, b, c } = await colaConTres();
    const enviar = vi.fn(async (request: EscaneoRequest) => {
      if (request.id === b.id) throw crearError();
      return RESPUESTA;
    });

    const resumen = await sincronizarPendientes(cola, enviar, 'user-1');

    expect(enviar).toHaveBeenCalledTimes(2);
    expect(enviar).not.toHaveBeenCalledWith(expect.objectContaining({ id: c.id }));
    expect(resumen).toEqual({ enviados: 1, rechazados: 0, restantes: 2, detenidoPor: motivo });
    const cola2 = await cola.listar();
    expect(cola2.map((r) => r.id)).toEqual([b.id, c.id]);
    expect(cola2.every((r) => r.estado.tipo === 'PENDIENTE')).toBe(true);
    expect(cola2.map((r) => r.id)).not.toContain(a.id);
  });

  it('RF-16: dos sincronizaciones simultáneas no envían el mismo registro dos veces', async () => {
    const { cola } = await colaConTres();
    const enviar = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 0));
      return RESPUESTA;
    });

    const [uno, dos] = await Promise.all([sincronizarPendientes(cola, enviar, 'user-1'), sincronizarPendientes(cola, enviar, 'user-1')]);

    expect(enviar).toHaveBeenCalledTimes(3);
    expect(uno.enviados).toBe(3);
    expect(dos).toEqual(uno);
  });

  it('RF-16: permite sincronizar de nuevo cuando la corrida anterior terminó', async () => {
    const cola = crearColaEnMemoria();
    const enviar = vi.fn(async () => RESPUESTA);
    await sincronizarPendientes(cola, enviar, 'user-1');
    await encolarRegistro(cola, { token: 'x' }, 'user-1', reloj(0));

    const resumen = await sincronizarPendientes(cola, enviar, 'user-1');

    expect(resumen.enviados).toBe(1);
  });
});

describe('descartarRechazado', () => {
  it('RF-16: descarta un registro rechazado', async () => {
    const { cola, a } = await colaConTres();
    await cola.marcarRechazado(a.id, { code: 'X', message: 'Y' });

    await descartarRechazado(cola, a.id);

    expect((await cola.listar()).map((r) => r.id)).not.toContain(a.id);
  });

  it('RF-16: no descarta un registro que sigue pendiente', async () => {
    const { cola, a } = await colaConTres();

    await descartarRechazado(cola, a.id);

    expect(await cola.listar()).toHaveLength(3);
  });
});
