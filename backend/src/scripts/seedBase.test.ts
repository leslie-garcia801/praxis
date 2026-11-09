import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { CARRERAS, PLANTEL_NOMBRE, seedBase } from './seedBase.js';

const ADMIN = {
  email: 'Admin.Seed@cbtis258.edu.mx',
  password: 'Clave-Inicial-2026',
  nombre: 'Administración CBTIS 258',
};
const ADMIN_EMAIL = ADMIN.email.toLowerCase();

async function cleanup() {
  const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (user) {
    await prisma.auditLog.deleteMany({ where: { entidadId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.plantel.deleteMany({ where: { nombre: PLANTEL_NOMBRE } });
  await prisma.carrera.deleteMany({ where: { nombre: { in: [...CARRERAS] } } });
}

describe('seedBase', () => {
  beforeEach(cleanup);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('creates the CBTIS 258 campus and the first administrator', async () => {
    const result = await seedBase(prisma, { admin: ADMIN });

    expect(result).toEqual({ plantelCreado: true, adminCreado: true, carrerasCreadas: CARRERAS.length });

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: ADMIN_EMAIL },
      include: { accounts: true, plantel: true },
    });
    expect(admin).toMatchObject({ name: ADMIN.nombre, rol: 'ADMIN', oficina: null, debeCambiar: true });
    expect(admin.plantel.nombre).toBe(PLANTEL_NOMBRE);
    expect(admin.accounts).toHaveLength(1);
    expect(admin.accounts[0]).toMatchObject({ providerId: 'credential', accountId: admin.id });
  });

  it('creates the campus career catalog', async () => {
    await seedBase(prisma, { admin: ADMIN });

    const carreras = await prisma.carrera.findMany({ where: { nombre: { in: [...CARRERAS] } } });
    expect(carreras.map((c) => c.nombre).sort()).toEqual([...CARRERAS].sort());
    expect(CARRERAS).toEqual([
      'Programación',
      'Inteligencia Artificial',
      'Ciberseguridad',
      'Logística',
      'Contabilidad',
      'Hospedaje',
      'Alimentos y Bebidas',
      'Mecánica Industrial',
    ]);
  });

  it('adds missing careers on re-run without duplicating existing ones', async () => {
    await seedBase(prisma, { admin: ADMIN });
    await prisma.carrera.delete({ where: { nombre: 'Hospedaje' } });

    const second = await seedBase(prisma, { admin: ADMIN });

    expect(second.carrerasCreadas).toBe(1);
    expect(await prisma.carrera.count({ where: { nombre: { in: [...CARRERAS] } } })).toBe(CARRERAS.length);
  });

  it('RNF-06: stores the admin password with argon2id, never in plain text', async () => {
    await seedBase(prisma, { admin: ADMIN });

    const account = await prisma.account.findFirstOrThrow({ where: { user: { email: ADMIN_EMAIL } } });
    expect(account.password?.startsWith('$argon2id$')).toBe(true);
  });

  it('RF-29: records the admin creation in the audit log', async () => {
    await seedBase(prisma, { admin: ADMIN });

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    const logs = await prisma.auditLog.findMany({ where: { entidadId: admin.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entidad: 'User', accion: 'CREAR_ADMIN' });
    expect(JSON.stringify(logs[0]!.despues)).not.toContain(ADMIN.password);
  });

  it('is idempotent and never overwrites an existing admin password', async () => {
    await seedBase(prisma, { admin: ADMIN });
    const before = await prisma.account.findFirstOrThrow({ where: { user: { email: ADMIN_EMAIL } } });

    const second = await seedBase(prisma, { admin: { ...ADMIN, password: 'Otra-Clave-Distinta' } });

    expect(second).toEqual({ plantelCreado: false, adminCreado: false, carrerasCreadas: 0 });
    expect(await prisma.plantel.count({ where: { nombre: PLANTEL_NOMBRE } })).toBe(1);
    expect(await prisma.user.count({ where: { email: ADMIN_EMAIL } })).toBe(1);
    const after = await prisma.account.findFirstOrThrow({ where: { user: { email: ADMIN_EMAIL } } });
    expect(after.password).toBe(before.password);
  });

  it('RF-03: the seeded admin can sign in with email and password', async () => {
    await seedBase(prisma, { admin: ADMIN });

    const res = await request(createApp())
      .post('/api/auth/sign-in/email')
      .set('Origin', process.env.FRONTEND_ORIGIN!)
      .set('X-Forwarded-For', '10.1.0.1')
      .send({ email: ADMIN.email, password: ADMIN.password });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: ADMIN_EMAIL, rol: 'ADMIN' });
  });
});
