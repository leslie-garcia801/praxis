import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarPlantel, crearCarreraPrueba, crearPlantel, crearUsuario, iniciarSesion } from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

describe('GET /api/carreras', () => {
  const app = createApp();
  let plantelId: string;
  let cookieVinculacion: string;
  let cookieAdmin: string;
  let cookieAlumno: string;

  const pedir = (cookie: string | null) => {
    const req = request(app).get('/api/carreras').set('Origin', ORIGIN);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    cookieVinculacion = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
    cookieAdmin = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ADMIN' }));
    cookieAlumno = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ALUMNO' }));
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  it('returns the carreras catalog ordered by nombre for vinculación', async () => {
    const a = await crearCarreraPrueba('Zeta');
    const b = await crearCarreraPrueba('Alfa');

    const res = await pedir(cookieVinculacion);

    expect(res.status).toBe(200);
    const nombres: string[] = res.body.carreras.map((c: { nombre: string }) => c.nombre);
    expect(res.body.carreras).toEqual(expect.arrayContaining([a, b].map((c) => ({ id: c.id, nombre: c.nombre }))));
    expect(nombres).toEqual([...nombres].sort((x, y) => x.localeCompare(y, 'es')));
    expect(nombres.indexOf(b.nombre)).toBeLessThan(nombres.indexOf(a.nombre));
    expect(Object.keys(res.body.carreras[0]).sort()).toEqual(['id', 'nombre']);
  });

  it('allows admin', async () => {
    expect((await pedir(cookieAdmin)).status).toBe(200);
  });

  it('returns 401 without a session', async () => {
    const res = await pedir(null);
    expect(res.status).toBe(401);
  });

  it('returns 403 for alumno', async () => {
    const res = await pedir(cookieAlumno);
    expect(res.status).toBe(403);
  });
});
