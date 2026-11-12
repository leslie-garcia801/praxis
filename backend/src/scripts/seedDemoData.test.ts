import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { instanteLocal } from '../lib/tiempo.js';
import { seedBase } from './seedBase.js';
import { DEMO_VINCULACION, seedDemo } from './seedDemoData.js';

// Thursday 2026-11-12 10:00 in Monterrey: the current week started on Monday 2026-11-09.
const AHORA = instanteLocal('2026-11-12', '10:00');
const PASSWORD = 'Demo-Praxis-2026';

describe('seedDemo', () => {
  beforeAll(async () => {
    await seedBase(prisma, { admin: { email: 'admin.demo@example.com', password: 'Clave-Inicial-2026', nombre: 'Admin' } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates vinculación users, institutions with QR and four students', async () => {
    const result = await seedDemo(prisma, { password: PASSWORD, ahora: AHORA });

    expect(result.creado).toBe(true);
    if (!result.creado) return;
    expect(result.instituciones).toHaveLength(3);
    expect(result.alumnos.map((a) => a.matricula)).toEqual(['25258000000001', '25258000000002', '25258000000003', '25258000000004']);

    for (const v of DEMO_VINCULACION) {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: v.email }, include: { accounts: true } });
      expect(user).toMatchObject({ rol: 'VINCULACION', oficina: v.oficina, debeCambiar: false });
      expect(user.accounts).toHaveLength(1);
    }

    const sinCuenta = await prisma.user.findUniqueOrThrow({ where: { username: '25258000000004' }, include: { accounts: true } });
    expect(sinCuenta.accounts).toHaveLength(0);
  });

  it('RN-04: the 7.5-hour demo day credits only 390 minutes', async () => {
    const turno = await prisma.asistencia.findFirstOrThrow({
      where: { entrada: instanteLocal('2026-10-30', '08:00'), expediente: { alumno: { usuario: { username: '25258000000001' } } } },
    });

    expect(turno.minutosAcreditables).toBe(390);
  });

  it('leaves today free and assigns each shift to the week of its entry day', async () => {
    const turnos = await prisma.asistencia.findMany({ include: { semana: true } });

    expect(turnos.every((t) => t.entrada < instanteLocal('2026-11-12', '00:00'))).toBe(true);
    const semanaActual = turnos.filter((t) => t.semana?.semanaInicio.toISOString().startsWith('2026-11-09'));
    expect(semanaActual).toHaveLength(3); // Monday to Wednesday of the current week
  });

  it('is idempotent: a second run changes nothing', async () => {
    const antes = await prisma.user.count();

    const result = await seedDemo(prisma, { password: PASSWORD, ahora: AHORA });

    expect(result).toEqual({ creado: false });
    expect(await prisma.user.count()).toBe(antes);
  });
});
