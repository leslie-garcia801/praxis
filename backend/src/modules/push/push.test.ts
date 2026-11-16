import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { borrarPlantel, crearPlantel, crearUsuario, iniciarSesion } from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

// The env object is shared by reference, so tests can switch the VAPID keys on and off.
vi.mock('../../config/env.js', async (importOriginal) => {
  const { env } = await importOriginal<typeof import('../../config/env.js')>();
  return { env: { ...env } };
});
const { env } = await import('../../config/env.js');

const suscripcion = (endpoint = 'https://fcm.googleapis.com/fcm/send/abc123') => ({
  endpoint,
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
});

describe('suscripciones push (RF-28)', () => {
  const app = createApp();
  let plantelId: string;
  let cookieAlumno: string;
  let cookieOtroAlumno: string;
  let cookieVinculacion: string;
  let alumnoId: string;
  let otroAlumnoId: string;

  const llamar = (metodo: 'get' | 'post' | 'delete', ruta: string, cookie: string | null, body?: object) => {
    const req = request(app)[metodo](ruta).set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    return body === undefined ? req : req.send(body);
  };

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    const alumno = await crearUsuario({ plantelId, username: '25319058890001' });
    const otro = await crearUsuario({ plantelId, username: '25319058890002' });
    const vinculacion = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' });
    alumnoId = alumno.id;
    otroAlumnoId = otro.id;
    cookieAlumno = await iniciarSesion(app, alumno);
    cookieOtroAlumno = await iniciarSesion(app, otro);
    cookieVinculacion = await iniciarSesion(app, vinculacion);
  });

  beforeEach(async () => {
    await prisma.suscripcionPush.deleteMany();
    Object.assign(env, { VAPID_PUBLIC_KEY: 'clave-publica-de-prueba', VAPID_PRIVATE_KEY: 'privada', VAPID_SUBJECT: 'mailto:a@b.invalid' });
  });

  afterAll(async () => {
    await prisma.suscripcionPush.deleteMany();
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  describe('GET /api/push/clave-publica', () => {
    it('RF-28: devuelve la clave pública a cualquier rol con sesión', async () => {
      for (const cookie of [cookieAlumno, cookieVinculacion]) {
        const res = await llamar('get', '/api/push/clave-publica', cookie);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ clavePublica: 'clave-publica-de-prueba' });
      }
    });

    it('RF-28: sin claves VAPID responde 503 PUSH_NO_CONFIGURADO en español', async () => {
      Object.assign(env, { VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined, VAPID_SUBJECT: undefined });
      const res = await llamar('get', '/api/push/clave-publica', cookieAlumno);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('PUSH_NO_CONFIGURADO');
      expect(res.body.error.message).toMatch(/notificaciones/i);
    });

    it('RF-28: sin sesión responde 401', async () => {
      const res = await llamar('get', '/api/push/clave-publica', null);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/push/suscripciones', () => {
    it('RF-28: el alumno registra su suscripción y responde 201 con el id', async () => {
      const res = await llamar('post', '/api/push/suscripciones', cookieAlumno, suscripcion());

      expect(res.status).toBe(201);
      expect(res.body.suscripcion.id).toEqual(expect.any(String));
      const guardada = await prisma.suscripcionPush.findUniqueOrThrow({ where: { id: res.body.suscripcion.id } });
      expect(guardada).toMatchObject({ usuarioId: alumnoId, endpoint: suscripcion().endpoint, p256dh: suscripcion().keys.p256dh, auth: suscripcion().keys.auth });
    });

    it('RF-28: repetir el mismo endpoint actualiza (200) sin duplicar', async () => {
      const primera = await llamar('post', '/api/push/suscripciones', cookieAlumno, suscripcion());
      const nuevas = { ...suscripcion(), keys: { p256dh: 'otra-p256dh', auth: 'otra-auth' } };

      const segunda = await llamar('post', '/api/push/suscripciones', cookieAlumno, nuevas);

      expect(segunda.status).toBe(200);
      expect(segunda.body.suscripcion.id).toBe(primera.body.suscripcion.id);
      expect(await prisma.suscripcionPush.count()).toBe(1);
      expect(await prisma.suscripcionPush.findFirstOrThrow()).toMatchObject({ p256dh: 'otra-p256dh', auth: 'otra-auth' });
    });

    it('RF-28: un endpoint ya registrado se reasigna al usuario que lo envía ahora', async () => {
      await llamar('post', '/api/push/suscripciones', cookieAlumno, suscripcion());

      const res = await llamar('post', '/api/push/suscripciones', cookieOtroAlumno, suscripcion());

      expect(res.status).toBe(200);
      const filas = await prisma.suscripcionPush.findMany();
      expect(filas).toHaveLength(1);
      expect(filas[0]!.usuarioId).toBe(otroAlumnoId);
    });

    it.each([
      ['sin cuerpo', {}],
      ['endpoint que no es https', { ...suscripcion('http://push.example.invalid/x') }],
      ['endpoint que no es URL', { ...suscripcion('no-es-url') }],
      ['endpoint demasiado largo', { ...suscripcion(`https://push.example.invalid/${'a'.repeat(2100)}`) }],
      ['sin keys', { endpoint: suscripcion().endpoint }],
      ['keys vacías', { endpoint: suscripcion().endpoint, keys: { p256dh: '', auth: '' } }],
      ['campos extra', { ...suscripcion(), admin: true }],
    ])('RF-28: %s responde 400', async (_nombre, body) => {
      const res = await llamar('post', '/api/push/suscripciones', cookieAlumno, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(await prisma.suscripcionPush.count()).toBe(0);
    });

    it('RF-28: acepta el JSON del navegador con expirationTime', async () => {
      const res = await llamar('post', '/api/push/suscripciones', cookieAlumno, { ...suscripcion(), expirationTime: null });
      expect(res.status).toBe(201);
    });

    it('RF-28: sin sesión responde 401', async () => {
      const res = await llamar('post', '/api/push/suscripciones', null, suscripcion());
      expect(res.status).toBe(401);
    });

    it('RF-28: vinculación no puede suscribirse (403)', async () => {
      const res = await llamar('post', '/api/push/suscripciones', cookieVinculacion, suscripcion());
      expect(res.status).toBe(403);
      expect(await prisma.suscripcionPush.count()).toBe(0);
    });
  });

  describe('DELETE /api/push/suscripciones', () => {
    const quitar = (cookie: string | null, body: object) => llamar('delete', '/api/push/suscripciones', cookie, body);

    it('RF-28: el alumno elimina su suscripción y responde 204', async () => {
      await llamar('post', '/api/push/suscripciones', cookieAlumno, suscripcion());

      const res = await quitar(cookieAlumno, { endpoint: suscripcion().endpoint });

      expect(res.status).toBe(204);
      expect(await prisma.suscripcionPush.count()).toBe(0);
    });

    it('RF-28: eliminar un endpoint desconocido también responde 204 (idempotente)', async () => {
      const res = await quitar(cookieAlumno, { endpoint: 'https://fcm.googleapis.com/fcm/send/no-existe' });
      expect(res.status).toBe(204);
    });

    it('RF-28: no elimina la suscripción de otro usuario', async () => {
      await llamar('post', '/api/push/suscripciones', cookieAlumno, suscripcion());

      const res = await quitar(cookieOtroAlumno, { endpoint: suscripcion().endpoint });

      expect(res.status).toBe(204);
      const fila = await prisma.suscripcionPush.findFirstOrThrow();
      expect(fila.usuarioId).toBe(alumnoId);
    });

    it.each([
      ['sin cuerpo', {}],
      ['endpoint vacío', { endpoint: '' }],
      ['campos extra', { endpoint: suscripcion().endpoint, otro: 1 }],
    ])('RF-28: %s responde 400', async (_nombre, body) => {
      const res = await quitar(cookieAlumno, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('RF-28: sin sesión responde 401', async () => {
      const res = await quitar(null, { endpoint: suscripcion().endpoint });
      expect(res.status).toBe(401);
    });

    it('RF-28: vinculación no puede darse de baja (403)', async () => {
      const res = await quitar(cookieVinculacion, { endpoint: suscripcion().endpoint });
      expect(res.status).toBe(403);
    });
  });
});
