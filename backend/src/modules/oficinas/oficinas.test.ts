import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarPlantel, crearPlantel, crearUsuario, iniciarSesion } from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

describe('/api/oficinas/responsables (RF-27, RF-29, RN-03b)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let adminId: string;
  let cookieAdmin: string;
  let cookieOtroAdmin: string;
  let cookieServicio: string;
  let cookieAlumno: string;

  // `null` means no session cookie (undefined would fall back to the admin's cookie).
  const leer = (cookie: string | null = cookieAdmin) => {
    const req = request(app).get('/api/oficinas/responsables').set('Origin', ORIGIN);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const guardar = (oficina: string, body: object, cookie: string | null = cookieAdmin) => {
    const req = request(app).put(`/api/oficinas/responsables/${oficina}`).set('Origin', ORIGIN).send(body);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    const admin = await crearUsuario({ plantelId, rol: 'ADMIN' });
    adminId = admin.id;
    cookieAdmin = await iniciarSesion(app, admin);
    cookieOtroAdmin = await iniciarSesion(app, await crearUsuario({ plantelId: otroPlantelId, rol: 'ADMIN' }));
    cookieServicio = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
    cookieAlumno = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ALUMNO' }));
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  it('RF-27: GET returns both offices in a stable order, empty when nothing is captured', async () => {
    const res = await leer();

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { oficina: 'SERVICIO_SOCIAL', nombreOficina: 'Oficina de Servicio Social y Titulación', nombre: null, cargo: null, actualizadoEn: null },
      { oficina: 'PRACTICAS', nombreOficina: 'Oficina de Prácticas Profesionales', nombre: null, cargo: null, actualizadoEn: null },
    ]);
  });

  it('RF-27: PUT creates the head of an office and then updates it (upsert)', async () => {
    const creada = await guardar('SERVICIO_SOCIAL', { nombre: '  Ing. Stephany Zúñiga ', cargo: 'Jefa de la Oficina de Servicio Social y Titulación' });

    expect(creada.status).toBe(200);
    expect(creada.body).toEqual({
      oficina: 'SERVICIO_SOCIAL',
      nombreOficina: 'Oficina de Servicio Social y Titulación',
      nombre: 'Ing. Stephany Zúñiga',
      cargo: 'Jefa de la Oficina de Servicio Social y Titulación',
      actualizadoEn: expect.any(String),
    });

    const actualizada = await guardar('SERVICIO_SOCIAL', { nombre: 'Lic. Otra Persona', cargo: 'Encargada' });
    expect(actualizada.status).toBe(200);
    expect(actualizada.body).toMatchObject({ nombre: 'Lic. Otra Persona', cargo: 'Encargada' });
    expect(await prisma.responsableOficina.count({ where: { plantelId, oficina: 'SERVICIO_SOCIAL' } })).toBe(1);

    const lista = await leer();
    expect(lista.body[0]).toMatchObject({ oficina: 'SERVICIO_SOCIAL', nombre: 'Lic. Otra Persona', cargo: 'Encargada' });
    expect(lista.body[1]).toMatchObject({ oficina: 'PRACTICAS', nombre: null });
  });

  it('RF-29: PUT writes an audit log with before and after', async () => {
    await guardar('PRACTICAS', { nombre: 'Lic. Primera', cargo: 'Jefa' });
    await guardar('PRACTICAS', { nombre: 'Lic. Segunda', cargo: 'Jefa de Prácticas' });

    const fila = await prisma.responsableOficina.findUniqueOrThrow({ where: { plantelId_oficina: { plantelId, oficina: 'PRACTICAS' } } });
    const logs = await prisma.auditLog.findMany({ where: { entidadId: fila.id }, orderBy: { fecha: 'asc' } });

    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ usuarioId: adminId, accion: 'EDITAR_RESPONSABLE_OFICINA', entidad: 'ResponsableOficina', antes: null });
    expect(logs[0]!.despues).toMatchObject({ oficina: 'PRACTICAS', nombre: 'Lic. Primera', cargo: 'Jefa' });
    expect(logs[1]!.antes).toMatchObject({ nombre: 'Lic. Primera', cargo: 'Jefa' });
    expect(logs[1]!.despues).toMatchObject({ nombre: 'Lic. Segunda', cargo: 'Jefa de Prácticas' });
  });

  it('RN-03b: vinculación can read both offices but cannot edit', async () => {
    const lectura = await leer(cookieServicio);
    expect(lectura.status).toBe(200);
    expect(lectura.body.map((o: { oficina: string }) => o.oficina)).toEqual(['SERVICIO_SOCIAL', 'PRACTICAS']);

    const res = await guardar('SERVICIO_SOCIAL', { nombre: 'X', cargo: 'Y' }, cookieServicio);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('RF-27: an admin of another plantel neither sees nor modifies these rows', async () => {
    const vista = await leer(cookieOtroAdmin);
    expect(vista.body.every((o: { nombre: string | null }) => o.nombre === null)).toBe(true);

    await guardar('SERVICIO_SOCIAL', { nombre: 'Otro Plantel', cargo: 'Jefa' }, cookieOtroAdmin);

    const propia = await leer();
    expect(propia.body[0]).toMatchObject({ nombre: 'Lic. Otra Persona' });
    expect(await prisma.responsableOficina.count({ where: { plantelId: otroPlantelId } })).toBe(1);
  });

  it.each([
    ['missing cargo', 'SERVICIO_SOCIAL', { nombre: 'X' }],
    ['blank nombre', 'SERVICIO_SOCIAL', { nombre: '   ', cargo: 'Jefa' }],
    ['nombre over 150 chars', 'SERVICIO_SOCIAL', { nombre: 'x'.repeat(151), cargo: 'Jefa' }],
    ['cargo over 150 chars', 'SERVICIO_SOCIAL', { nombre: 'X', cargo: 'x'.repeat(151) }],
    ['unknown extra field', 'SERVICIO_SOCIAL', { nombre: 'X', cargo: 'Y', otro: 1 }],
    ['unknown office', 'TITULACION', { nombre: 'X', cargo: 'Y' }],
  ])('RF-27: PUT 400 for %s', async (_caso, oficina, body) => {
    const res = await guardar(oficina, body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('401 without a session', async () => {
    expect((await leer(null)).status).toBe(401);
    expect((await guardar('SERVICIO_SOCIAL', { nombre: 'X', cargo: 'Y' }, null)).status).toBe(401);
  });

  it('403 for a student', async () => {
    expect((await leer(cookieAlumno)).status).toBe(403);
    expect((await guardar('SERVICIO_SOCIAL', { nombre: 'X', cargo: 'Y' }, cookieAlumno)).status).toBe(403);
  });
});
