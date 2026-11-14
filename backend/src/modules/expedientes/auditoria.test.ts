import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearExpediente,
  crearPlantel,
  crearSemana,
  crearUsuario,
  iniciarSesion,
  PASSWORD_PRUEBA,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

describe('GET /api/expedientes/:id/auditoria (RF-29, RF-25, RN-03b)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let expedienteId: string;
  let otroExpedienteId: string;
  let semanaId: string;
  let otraSemanaId: string;
  let oficinaId: string;
  let cookieServicio: string;
  let cookiePracticas: string;
  let cookieAdmin: string;
  let cookieAlumno: string;
  let cookieOtroPlantel: string;

  const pedir = (id: string, cookie: string | null) => {
    const req = request(app).get(`/api/expedientes/${id}/auditoria`).set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    return req;
  };

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    const alumno = await crearAlumnoPrecargado({ plantelId, matricula: '25319053980001', password: PASSWORD_PRUEBA });
    const otro = await crearAlumnoPrecargado({ plantelId, matricula: '25319053980002', password: PASSWORD_PRUEBA });
    expedienteId = (await crearExpediente({ alumnoId: alumno.alumno!.id, tipo: 'SERVICIO_SOCIAL' })).id;
    otroExpedienteId = (await crearExpediente({ alumnoId: otro.alumno!.id, tipo: 'SERVICIO_SOCIAL' })).id;
    semanaId = (await crearSemana({ expedienteId, semanaInicio: '2026-03-02', estado: 'VALIDADA' })).id;
    otraSemanaId = (await crearSemana({ expedienteId: otroExpedienteId, semanaInicio: '2026-03-02', estado: 'VALIDADA' })).id;

    const oficina = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' });
    oficinaId = oficina.id;
    await prisma.user.update({ where: { id: oficinaId }, data: { name: 'Marisol Vinculación' } });
    cookieServicio = await iniciarSesion(app, oficina);
    cookiePracticas = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
    cookieAdmin = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ADMIN' }));
    cookieAlumno = await iniciarSesion(app, alumno);
    cookieOtroPlantel = await iniciarSesion(app, await crearUsuario({ plantelId: otroPlantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));

    await prisma.auditLog.createMany({
      data: [
        {
          usuarioId: oficinaId,
          accion: 'SUSPENDER_EXPEDIENTE',
          entidad: 'Expediente',
          entidadId: expedienteId,
          antes: { estado: 'EN_PROCESO' },
          despues: { estado: 'SUSPENDIDO', motivo: 'Licencia médica' },
          fecha: new Date('2026-03-10T15:00:00.000Z'),
        },
        {
          usuarioId: null,
          accion: 'VALIDAR_SEMANA',
          entidad: 'SemanaBitacora',
          entidadId: semanaId,
          antes: { estado: 'ENVIADA' },
          despues: { estado: 'VALIDADA' },
          fecha: new Date('2026-03-12T15:00:00.000Z'),
        },
        {
          usuarioId: oficinaId,
          accion: 'CANCELAR_EXPEDIENTE',
          entidad: 'Expediente',
          entidadId: otroExpedienteId,
          fecha: new Date('2026-03-11T15:00:00.000Z'),
        },
        {
          usuarioId: null,
          accion: 'VALIDAR_SEMANA',
          entidad: 'SemanaBitacora',
          entidadId: otraSemanaId,
          fecha: new Date('2026-03-13T15:00:00.000Z'),
        },
        // Same id, different entity: must not be mistaken for this case file.
        { usuarioId: oficinaId, accion: 'CAMBIAR_CONTRASENA', entidad: 'User', entidadId: expedienteId },
      ],
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: [semanaId, otraSemanaId] } } });
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  it('lists the entries of the case file and its weeks, newest first, with the actor name', async () => {
    const res = await pedir(expedienteId, cookieServicio);
    expect(res.status).toBe(200);
    expect(res.body.limite).toBe(200);
    expect(res.body.truncado).toBe(false);
    expect(res.body.entradas.map((e: { accion: string }) => e.accion)).toEqual(['VALIDAR_SEMANA', 'SUSPENDER_EXPEDIENTE']);
    const [semana, estado] = res.body.entradas;
    expect(semana).toMatchObject({ usuario: 'Sistema', entidad: 'SemanaBitacora', fecha: '2026-03-12T15:00:00.000Z' });
    expect(estado).toMatchObject({
      usuario: 'Marisol Vinculación',
      entidad: 'Expediente',
      antes: { estado: 'EN_PROCESO' },
      despues: { estado: 'SUSPENDIDO', motivo: 'Licencia médica' },
    });
  });

  it('does not leak entries of another case file or of other entities', async () => {
    const res = await pedir(expedienteId, cookieAdmin);
    expect(res.status).toBe(200);
    const acciones = res.body.entradas.map((e: { accion: string }) => e.accion);
    expect(acciones).not.toContain('CANCELAR_EXPEDIENTE');
    expect(acciones).not.toContain('CAMBIAR_CONTRASENA');
    expect(res.body.entradas).toHaveLength(2);
  });

  it('401 without a session', async () => {
    expect((await pedir(expedienteId, null)).status).toBe(401);
  });

  it('403 for a student, even for their own case file', async () => {
    expect((await pedir(expedienteId, cookieAlumno)).status).toBe(403);
  });

  it('RN-03b: vinculación of the other office is denied', async () => {
    expect((await pedir(expedienteId, cookiePracticas)).status).toBe(403);
  });

  it('404 for another plantel or a case file that does not exist', async () => {
    expect((await pedir(expedienteId, cookieOtroPlantel)).status).toBe(404);
    expect((await pedir('00000000-0000-4000-8000-000000000000', cookieAdmin)).status).toBe(404);
  });

  it('400 when the id is not a valid identifier', async () => {
    const res = await pedir('no-es-un-id', cookieAdmin);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body.error.details)).toContain('El identificador del expediente no es válido.');
  });
});
