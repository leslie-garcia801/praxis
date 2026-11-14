import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { borrarPlantel, crearAlumnoPrecargado, crearPlantel, crearUsuario } from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;
const MATRICULA = '25319051769999';
const NOMBRE_OK = { nombre: 'ana maria', apellidoPaterno: 'LOPEZ' };

// Unique client IP per request group so the in-memory rate limiter does not leak between tests.
let ipCounter = 0;
const nextIp = () => `10.50.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

describe('activación de cuenta (RF-02)', () => {
  const app = createApp();
  let plantelId: string;

  const post = (path: string, body: object, ip = nextIp()) =>
    request(app).post(path).set('Origin', ORIGIN).set('X-Forwarded-For', ip).send(body);
  const verificar = (body: object, ip?: string) => post('/api/auth/activar/verificar', body, ip);
  const activar = (body: object, ip?: string) => post('/api/auth/activar', body, ip);

  beforeEach(async () => {
    if (plantelId) await borrarPlantel(plantelId);
    plantelId = (await crearPlantel()).id;
    await crearAlumnoPrecargado({ plantelId, matricula: MATRICULA });
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  describe('POST /api/auth/activar/verificar', () => {
    it('RF-02: accepts the control number with name and first surname, ignoring case and accents', async () => {
      const res = await verificar({ matricula: MATRICULA, ...NOMBRE_OK });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('RF-02: unknown control number tells the student to go to vinculación', async () => {
      const res = await verificar({ matricula: '25319051760000', ...NOMBRE_OK });

      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({
        code: 'MATRICULA_NO_REGISTRADA',
        message: 'Tu matrícula no está registrada; acude a la Oficina de Prácticas Profesionales o a la de Servicio Social y Titulación.',
      });
    });

    it('RF-02: rejects a name that does not match', async () => {
      const res = await verificar({ matricula: MATRICULA, nombre: 'Ana', apellidoPaterno: 'López' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NOMBRE_NO_COINCIDE');
      expect(res.body.error.message).toBe(
        'El nombre no coincide con el registrado. Revisa cómo lo escribiste o acude a la Oficina de Prácticas Profesionales o a la de Servicio Social y Titulación.',
      );
    });

    it('RNF-07: never reveals the stored name', async () => {
      const res = await verificar({ matricula: MATRICULA, nombre: 'Otro', apellidoPaterno: 'Nombre' });

      expect(JSON.stringify(res.body)).not.toMatch(/Ana|López|Lopez|García/);
    });

    it('400 for an invalid control number', async () => {
      const res = await verificar({ matricula: '123', ...NOMBRE_OK });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('409 when the account is already activated (only after the name matches)', async () => {
      await activar({ matricula: MATRICULA, ...NOMBRE_OK, password: 'Secreta123' });

      const wrongName = await verificar({ matricula: MATRICULA, nombre: 'X', apellidoPaterno: 'Y' });
      const res = await verificar({ matricula: MATRICULA, ...NOMBRE_OK });

      expect(wrongName.status).toBe(400);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CUENTA_YA_ACTIVADA');
    });

    it('403 from an untrusted origin', async () => {
      const res = await request(app)
        .post('/api/auth/activar/verificar')
        .set('Origin', 'https://malicioso.example')
        .send({ matricula: MATRICULA, ...NOMBRE_OK });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/auth/activar', () => {
    it('RF-02: creates the password and the student can sign in with the control number', async () => {
      const res = await activar({ matricula: MATRICULA, ...NOMBRE_OK, password: 'Secreta123' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true });

      const login = await post('/api/auth/sign-in/username', { username: MATRICULA, password: 'Secreta123' });
      expect(login.status).toBe(200);
    });

    it('RNF-06: stores the password with argon2id', async () => {
      await activar({ matricula: MATRICULA, ...NOMBRE_OK, password: 'Secreta123' });

      const account = await prisma.account.findFirstOrThrow({ where: { user: { username: MATRICULA } } });
      expect(account.providerId).toBe('credential');
      expect(account.password?.startsWith('$argon2id$')).toBe(true);
    });

    it('RF-29: records the activation in the audit log without the password', async () => {
      await activar({ matricula: MATRICULA, ...NOMBRE_OK, password: 'Secreta123' });

      const user = await prisma.user.findUniqueOrThrow({ where: { username: MATRICULA } });
      const logs = await prisma.auditLog.findMany({ where: { entidadId: user.id } });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ accion: 'ACTIVAR_CUENTA', entidad: 'User', usuarioId: user.id });
      expect(JSON.stringify(logs[0])).not.toContain('Secreta123');
    });

    it('RF-02: the email is optional and replaces the placeholder when given', async () => {
      await activar({ matricula: MATRICULA, ...NOMBRE_OK, password: 'Secreta123', email: 'Ana.Lopez@Gmail.com' });

      const user = await prisma.user.findUniqueOrThrow({ where: { username: MATRICULA } });
      expect(user.email).toBe('ana.lopez@gmail.com');
      expect(user.emailVerified).toBe(false);
    });

    it('409 when the email belongs to another user', async () => {
      const otro = await crearUsuario({ plantelId, rol: 'VINCULACION' });

      const res = await activar({ matricula: MATRICULA, ...NOMBRE_OK, password: 'Secreta123', email: otro.email });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CORREO_EN_USO');
      expect(await prisma.account.count({ where: { user: { username: MATRICULA } } })).toBe(0);
    });

    it('409 when activating twice; the first password stays', async () => {
      await activar({ matricula: MATRICULA, ...NOMBRE_OK, password: 'Secreta123' });

      const res = await activar({ matricula: MATRICULA, ...NOMBRE_OK, password: 'OtraClave456' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CUENTA_YA_ACTIVADA');
      expect(await prisma.account.count({ where: { user: { username: MATRICULA } } })).toBe(1);
    });

    it('RF-02: does not activate when the name does not match', async () => {
      const res = await activar({ matricula: MATRICULA, nombre: 'Ana', apellidoPaterno: 'López', password: 'Secreta123' });

      expect(res.status).toBe(400);
      expect(await prisma.account.count({ where: { user: { username: MATRICULA } } })).toBe(0);
    });

    it('400 for a password shorter than 8 characters', async () => {
      const res = await activar({ matricula: MATRICULA, ...NOMBRE_OK, password: 'corta' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('403 for a deactivated student', async () => {
      await prisma.user.update({ where: { username: MATRICULA }, data: { activo: false } });

      const res = await activar({ matricula: MATRICULA, ...NOMBRE_OK, password: 'Secreta123' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CUENTA_INACTIVA');
      expect(res.body.error.message).toBe('Tu cuenta está desactivada. Acude a la Oficina de Prácticas Profesionales o a la de Servicio Social y Titulación.');
    });

    it('RNF-06: limits activation attempts per client', async () => {
      const ip = nextIp();
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push((await activar({ matricula: MATRICULA, nombre: 'X', apellidoPaterno: 'Y', password: 'Secreta123' }, ip)).status);
      }

      expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
      expect(statuses[10]).toBe(429);
    });
  });
});
