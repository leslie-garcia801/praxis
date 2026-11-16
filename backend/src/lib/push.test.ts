import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { borrarPlantel, crearPlantel, crearUsuario } from '../../test/factories.js';
import { enviarPush, limpiarNotificaciones, notificacionesEnviadas } from './push.js';
import { prisma } from './prisma.js';

const mensaje = { titulo: 'Praxis', cuerpo: '¿Olvidaste registrar tu salida?', url: '/alumno' };

describe('push en modo de pruebas (RF-28)', () => {
  let plantelId: string;
  let usuarioId: string;
  let otroId: string;

  const suscribir = (usuario: string, endpoint: string) =>
    prisma.suscripcionPush.create({ data: { usuarioId: usuario, endpoint, p256dh: 'p', auth: 'a' } });

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    usuarioId = (await crearUsuario({ plantelId, username: '25319058880001' })).id;
    otroId = (await crearUsuario({ plantelId, username: '25319058880002' })).id;
  });

  beforeEach(async () => {
    limpiarNotificaciones();
    await prisma.suscripcionPush.deleteMany();
  });

  afterAll(async () => {
    await prisma.suscripcionPush.deleteMany();
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  it('RF-28: guarda en la bandeja una notificación por cada suscripción del usuario', async () => {
    await suscribir(usuarioId, 'https://push.example.invalid/a');
    await suscribir(usuarioId, 'https://push.example.invalid/b');
    await suscribir(otroId, 'https://push.example.invalid/c');

    const resultado = await enviarPush(usuarioId, mensaje);

    expect(resultado).toEqual({ enviadas: 2, eliminadas: 0, errores: [] });
    const enviadas = notificacionesEnviadas();
    expect(enviadas.map((n) => n.endpoint).sort()).toEqual(['https://push.example.invalid/a', 'https://push.example.invalid/b']);
    expect(enviadas[0]).toMatchObject({ usuarioId, ...mensaje });
  });

  it('RF-28: un usuario sin suscripciones no genera envíos', async () => {
    expect(await enviarPush(usuarioId, mensaje)).toEqual({ enviadas: 0, eliminadas: 0, errores: [] });
    expect(notificacionesEnviadas()).toEqual([]);
  });

  it('RF-28: limpiarNotificaciones vacía la bandeja', async () => {
    await suscribir(usuarioId, 'https://push.example.invalid/a');
    await enviarPush(usuarioId, mensaje);
    limpiarNotificaciones();
    expect(notificacionesEnviadas()).toEqual([]);
  });
});

describe('push en producción (RF-28)', () => {
  let plantelId: string;
  let usuarioId: string;
  const sendNotification = vi.fn();
  const setVapidDetails = vi.fn();

  const suscribir = (endpoint: string) =>
    prisma.suscripcionPush.create({ data: { usuarioId, endpoint, p256dh: 'clave-p256dh', auth: 'clave-auth' } });

  beforeAll(async () => {
    vi.resetModules();
    plantelId = (await crearPlantel()).id;
    usuarioId = (await crearUsuario({ plantelId, username: '25319058880003' })).id;
  });

  beforeEach(async () => {
    sendNotification.mockReset();
    setVapidDetails.mockReset();
    await prisma.suscripcionPush.deleteMany();
  });

  afterAll(async () => {
    await prisma.suscripcionPush.deleteMany();
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
    vi.doUnmock('../config/env.js');
    vi.doUnmock('web-push');
  });

  // Loads a fresh copy of the sender with production configuration and a mocked web-push.
  async function cargar({ conClaves = true } = {}) {
    vi.resetModules();
    vi.doMock('../config/env.js', async (importOriginal) => {
      const { env } = await importOriginal<typeof import('../config/env.js')>();
      const claves = conClaves
        ? { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:vinculacion@praxis.invalid' }
        : { VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined, VAPID_SUBJECT: undefined };
      return { env: { ...env, NODE_ENV: 'production', ...claves } };
    });
    // web-push 4 is ESM-only with named exports and no default export; the mock keeps that shape.
    vi.doMock('web-push', () => ({ sendNotification, setVapidDetails }));
    const { enviarPush } = await import('./push.js');
    return { enviarPush };
  }

  it('RF-28: envía el JSON { titulo, cuerpo, url } a cada suscripción con las claves VAPID', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    await suscribir('https://push.example.invalid/a');
    await suscribir('https://push.example.invalid/b');
    const { enviarPush } = await cargar();

    const resultado = await enviarPush(usuarioId, mensaje);

    expect(resultado).toEqual({ enviadas: 2, eliminadas: 0, errores: [] });
    expect(setVapidDetails).toHaveBeenCalledWith('mailto:vinculacion@praxis.invalid', 'pub', 'priv');
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [suscripcion, carga] = sendNotification.mock.calls[0]!;
    expect(suscripcion).toEqual({ endpoint: expect.stringContaining('https://push.example.invalid/'), keys: { p256dh: 'clave-p256dh', auth: 'clave-auth' } });
    expect(JSON.parse(carga as string)).toEqual(mensaje);
  });

  it('RF-28: sin claves VAPID en producción el push queda apagado: no envía, no falla y avisa una vez', async () => {
    await suscribir('https://push.example.invalid/a');
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { enviarPush } = await cargar({ conClaves: false });

    const primero = await enviarPush(usuarioId, mensaje);
    const segundo = await enviarPush(usuarioId, mensaje);

    expect(primero).toEqual({ enviadas: 0, eliminadas: 0, errores: [] });
    expect(segundo).toEqual({ enviadas: 0, eliminadas: 0, errores: [] });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(setVapidDetails).not.toHaveBeenCalled();
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso.mock.calls[0]![0]).toMatch(/VAPID/);
    expect(await prisma.suscripcionPush.count({ where: { usuarioId } })).toBe(1);
    aviso.mockRestore();
  });

  it.each([404, 410])('RF-28: un %i del servicio push elimina esa suscripción y no es un error', async (statusCode) => {
    sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith('/muerta')) throw Object.assign(new Error('gone'), { statusCode });
      return { statusCode: 201 };
    });
    await suscribir('https://push.example.invalid/muerta');
    await suscribir('https://push.example.invalid/viva');
    const { enviarPush } = await cargar();

    const resultado = await enviarPush(usuarioId, mensaje);

    expect(resultado).toEqual({ enviadas: 1, eliminadas: 1, errores: [] });
    const quedan = await prisma.suscripcionPush.findMany({ select: { endpoint: true } });
    expect(quedan).toEqual([{ endpoint: 'https://push.example.invalid/viva' }]);
  });

  it('RF-28: otros fallos se recopilan sin lanzar, sin borrar la suscripción y sin detener las demás', async () => {
    sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith('/rota')) throw Object.assign(new Error('boom'), { statusCode: 500 });
      return { statusCode: 201 };
    });
    await suscribir('https://push.example.invalid/rota');
    await suscribir('https://push.example.invalid/viva');
    const { enviarPush } = await cargar();

    const resultado = await enviarPush(usuarioId, mensaje);

    expect(resultado.enviadas).toBe(1);
    expect(resultado.eliminadas).toBe(0);
    expect(resultado.errores).toEqual([{ endpoint: 'https://push.example.invalid/rota', mensaje: 'boom' }]);
    expect(await prisma.suscripcionPush.count()).toBe(2);
  });
});
