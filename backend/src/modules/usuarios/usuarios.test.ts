import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarPlantel, crearPlantel, crearUsuario, iniciarSesion } from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

describe('POST /api/usuarios (RN-03b)', () => {
  const app = createApp();
  let plantelId: string;
  let adminId: string;
  let cookieAdmin: string;
  let correoSeq = 0;

  const nuevoCorreo = () => `vinculacion${++correoSeq}.${Date.now()}@cbtis258.edu.mx`;
  // `null` means no session cookie (undefined would fall back to the admin's cookie).
  const crear = (body: object, cookie: string | null = cookieAdmin) => {
    const req = request(app).post('/api/usuarios').set('Origin', ORIGIN).send(body);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    const admin = await crearUsuario({ plantelId, rol: 'ADMIN' });
    adminId = admin.id;
    cookieAdmin = await iniciarSesion(app, admin);
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  it('RN-03b: the admin creates a vinculación user for one office with a temporary password', async () => {
    const email = nuevoCorreo();

    const res = await crear({ nombre: 'Delfina Hernández Mendoza', email, oficina: 'PRACTICAS' });

    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.usuario).toEqual({
      id: expect.any(String),
      nombre: 'Delfina Hernández Mendoza',
      email,
      rol: 'VINCULACION',
      oficina: 'PRACTICAS',
    });
    expect(res.body.passwordTemporal).toMatch(/^[A-Za-z2-9]{10}$/);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.usuario.id } });
    expect(user).toMatchObject({ plantelId, debeCambiar: true, activo: true, username: null });
  });

  it('RF-04: the new user signs in with the temporary password and must change it', async () => {
    const email = nuevoCorreo();
    const res = await crear({ nombre: 'Stephany Zúñiga Regino', email, oficina: 'SERVICIO_SOCIAL' });

    const cookie = await iniciarSesion(app, { email }, res.body.passwordTemporal);
    const me = await request(app).get('/api/me').set('Cookie', cookie);

    expect(me.body.usuario).toMatchObject({ rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL', debeCambiar: true });
  });

  it('RN-03b: oficina null gives access to both offices', async () => {
    const res = await crear({ nombre: 'Apoyo Vinculación', email: nuevoCorreo(), oficina: null });

    expect(res.status).toBe(201);
    expect(res.body.usuario.oficina).toBeNull();
  });

  it('normalizes the email to lowercase', async () => {
    const res = await crear({ nombre: 'Mayúsculas', email: `MAYUS${Date.now()}@CBTIS258.EDU.MX`, oficina: 'PRACTICAS' });

    expect(res.body.usuario.email).toBe(res.body.usuario.email.toLowerCase());
  });

  it('RF-29: records who created the user, without the password', async () => {
    const res = await crear({ nombre: 'Auditada', email: nuevoCorreo(), oficina: 'PRACTICAS' });

    const logs = await prisma.auditLog.findMany({ where: { entidadId: res.body.usuario.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ usuarioId: adminId, accion: 'CREAR_USUARIO', entidad: 'User' });
    expect(JSON.stringify(logs[0])).not.toContain(res.body.passwordTemporal);
  });

  it('409 when the email is already registered', async () => {
    const email = nuevoCorreo();
    await crear({ nombre: 'Primera', email, oficina: 'PRACTICAS' });

    const res = await crear({ nombre: 'Segunda', email: email.toUpperCase(), oficina: 'PRACTICAS' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CORREO_EN_USO');
  });

  it.each([
    ['missing office', { nombre: 'X', email: 'x1@cbtis258.edu.mx' }],
    ['unknown office', { nombre: 'X', email: 'x2@cbtis258.edu.mx', oficina: 'TITULACION' }],
    ['invalid email', { nombre: 'X', email: 'no-es-correo', oficina: 'PRACTICAS' }],
    ['empty name', { nombre: '  ', email: 'x3@cbtis258.edu.mx', oficina: 'PRACTICAS' }],
  ])('400 for %s', async (_caso, body) => {
    const res = await crear(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('401 without a session', async () => {
    const res = await crear({ nombre: 'X', email: nuevoCorreo(), oficina: 'PRACTICAS' }, null);

    expect(res.status).toBe(401);
  });

  it.each(['VINCULACION', 'ALUMNO'] as const)('403 for %s', async (rol) => {
    const cookie = await iniciarSesion(app, await crearUsuario({ plantelId, rol }));

    const res = await crear({ nombre: 'X', email: nuevoCorreo(), oficina: 'PRACTICAS' }, cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
