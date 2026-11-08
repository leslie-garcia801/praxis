import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { hashPassword } from './password.js';
import { prisma } from './prisma.js';

const MATRICULA = '25319051760001';
const PASSWORD = 'Secreta123';
const ORIGIN = process.env.FRONTEND_ORIGIN!;

// Each test uses its own client IP so the in-memory rate limiter does not leak between tests.
let ipCounter = 1;
const nextIp = () => `10.0.0.${ipCounter++}`;

describe('Better Auth', () => {
  const app = createApp();
  let plantelId: string;
  let userId: string;

  beforeAll(async () => {
    const plantel = await prisma.plantel.create({ data: { nombre: 'CBTIS 258 (auth test)' } });
    plantelId = plantel.id;
    userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        name: 'Ana López',
        email: `${MATRICULA}@alumno.praxis.invalid`,
        username: MATRICULA,
        displayUsername: MATRICULA,
        plantelId,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: userId,
            providerId: 'credential',
            password: await hashPassword(PASSWORD),
          },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.plantel.deleteMany({ where: { id: plantelId } });
    await prisma.$disconnect();
  });

  it('mounts the handler on /api/auth/*', async () => {
    const res = await request(app).get('/api/auth/ok');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('RF-02: open sign-up is disabled', async () => {
    const res = await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', nextIp())
      .send({ name: 'Intruso', email: 'intruso@example.com', password: 'Secreta123' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.user.count({ where: { email: 'intruso@example.com' } })).toBe(0);
  });

  it('RF-03: student signs in with the control number and gets a 30-day httpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/username')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', nextIp())
      .send({ username: MATRICULA, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: userId, username: MATRICULA, rol: 'ALUMNO' });

    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const session = cookies.find((c) => c.includes('session_token='));
    expect(session).toBeDefined();
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/Max-Age=2592000/);
  });

  it('RF-03: signing out ends the session', async () => {
    const login = await request(app)
      .post('/api/auth/sign-in/username')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', nextIp())
      .send({ username: MATRICULA, password: PASSWORD });
    const cookie = ([] as string[])
      .concat(login.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0])
      .join('; ');
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(200);

    const res = await request(app).post('/api/auth/sign-out').set('Origin', ORIGIN).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('RF-03: rejects a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/username')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', nextIp())
      .send({ username: MATRICULA, password: 'otra-clave' });

    expect(res.status).toBe(401);
  });

  describe('deactivated accounts', () => {
    const signIn = (password: string) =>
      request(app)
        .post('/api/auth/sign-in/username')
        .set('Origin', ORIGIN)
        .set('X-Forwarded-For', nextIp())
        .send({ username: MATRICULA, password });

    beforeAll(async () => {
      await prisma.user.update({ where: { id: userId }, data: { activo: false } });
    });

    afterAll(async () => {
      await prisma.user.update({ where: { id: userId }, data: { activo: true } });
    });

    it('cannot sign in, and no session is created', async () => {
      const sesionesAntes = await prisma.session.count({ where: { userId } });

      const res = await signIn(PASSWORD);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'CUENTA_INACTIVA', message: expect.stringMatching(/desactivada/) });
      expect(await prisma.session.count({ where: { userId } })).toBe(sesionesAntes);
    });

    it('a wrong password still answers 401, so the status is not revealed without the password', async () => {
      expect((await signIn('otra-clave')).status).toBe(401);
    });
  });

  it('RF-03: rejects requests from an untrusted origin', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/username')
      .set('Origin', 'https://sitio-malicioso.example')
      .set('X-Forwarded-For', nextIp())
      .send({ username: MATRICULA, password: PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORIGEN_NO_PERMITIDO');
  });

  it('RNF-06: limits sign-in attempts per client', async () => {
    const ip = nextIp();
    const attempt = () =>
      request(app)
        .post('/api/auth/sign-in/username')
        .set('Origin', ORIGIN)
        .set('X-Forwarded-For', ip)
        .send({ username: MATRICULA, password: 'otra-clave' });

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await attempt()).status);

    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it.each([
    ['/change-password', 'replaced by POST /api/me/cambiar-contrasena (clears debeCambiar)'],
    ['/update-user', 'names come from Edumedia'],
    ['/is-username-available', 'would reveal which control numbers exist'],
    ['/request-password-reset', 'resets go through vinculación (RF-04)'],
  ])('disables %s (%s)', async (path) => {
    const res = await request(app)
      .post(`/api/auth${path}`)
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', nextIp())
      .send({ username: MATRICULA, email: 'x@example.com', name: 'X' });

    expect(res.status).toBe(404);
  });

  it('client cannot set the role through the API (input: false)', async () => {
    const res = await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', nextIp())
      .send({ name: 'X', email: 'x@example.com', password: 'Secreta123', rol: 'ADMIN' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.user.count({ where: { rol: 'ADMIN', email: 'x@example.com' } })).toBe(0);
  });
});
