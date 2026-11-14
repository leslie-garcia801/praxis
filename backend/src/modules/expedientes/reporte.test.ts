import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearExpediente,
  crearInstitucion,
  crearPlantel,
  crearSemana,
  crearSupervisor,
  crearUsuario,
  iniciarSesion,
  PASSWORD_PRUEBA,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { datosReporte } from './reporte.service.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

describe('GET /api/expedientes/:id/reporte.pdf (RF-27, RN-03b, RN-15)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let expedienteId: string;
  let cookieAlumno: string;
  let cookieOtroAlumno: string;
  let cookieServicio: string;
  let cookiePracticas: string;
  let cookieAdmin: string;
  let cookieOtroPlantel: string;
  let adminUser: AuthUser;

  const pedir = (id: string, cookie: string | null, query = '') => {
    const req = request(app)
      .get(`/api/expedientes/${id}/reporte.pdf${query}`)
      .set('Origin', ORIGIN)
      .buffer(true)
      .parse((res, cb) => {
        const trozos: Buffer[] = [];
        res.on('data', (t: Buffer) => trozos.push(t));
        res.on('end', () => cb(null, Buffer.concat(trozos)));
      });
    if (cookie) req.set('Cookie', cookie);
    return req;
  };

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    const alumno = await crearAlumnoPrecargado({ plantelId, matricula: '25319053990001', password: PASSWORD_PRUEBA });
    const otro = await crearAlumnoPrecargado({ plantelId, matricula: '25319053990002', password: PASSWORD_PRUEBA });
    const institucion = await crearInstitucion({ plantelId });
    const supervisor = await crearSupervisor({ institucionId: institucion.id, datos: { titulo: 'Lic.', puesto: 'Jefa' } });
    const expediente = await crearExpediente({
      alumnoId: alumno.alumno!.id,
      tipo: 'SERVICIO_SOCIAL',
      institucionId: institucion.id,
      datos: { supervisorId: supervisor.id, departamento: 'Archivo' },
    });
    expedienteId = expediente.id;
    await crearSemana({ expedienteId, semanaInicio: '2026-03-02', estado: 'VALIDADA', minutos: [240, 120] });
    await crearSemana({ expedienteId, semanaInicio: '2026-03-09', estado: 'ENVIADA', minutos: [60] });

    cookieAlumno = await iniciarSesion(app, alumno);
    cookieOtroAlumno = await iniciarSesion(app, otro);
    cookieServicio = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
    cookiePracticas = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
    const admin = await crearUsuario({ plantelId, rol: 'ADMIN' });
    adminUser = { id: admin.id, plantelId, rol: 'ADMIN', oficina: null } as AuthUser;
    cookieAdmin = await iniciarSesion(app, admin);
    cookieOtroPlantel = await iniciarSesion(app, await crearUsuario({ plantelId: otroPlantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  it('the student downloads their own report as a PDF', async () => {
    const res = await pedir(expedienteId, cookieAlumno);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="reporte-25319053990001-\d{4}-\d{2}-\d{2}\.pdf"$/);
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('vinculación of the office and admin can download it, with a range', async () => {
    expect((await pedir(expedienteId, cookieServicio, '?desde=2026-03-01&hasta=2026-03-31')).status).toBe(200);
    expect((await pedir(expedienteId, cookieAdmin, '?desde=2026-03-01')).status).toBe(200);
  });

  it('the data only counts validated weeks and the accumulated total comes from a query', async () => {
    const datos = await datosReporte(adminUser, expedienteId, {});
    expect(datos.turnos).toHaveLength(2);
    expect(datos.semanas).toHaveLength(1);
    expect(datos.minutosValidadosAcumulados).toBe(360);
    expect(datos.metaMinutos).toBe(480 * 60);
  });

  it('400 when the dates are malformed or desde is after hasta', async () => {
    expect((await pedir(expedienteId, cookieAlumno, '?desde=ayer')).status).toBe(400);
    const res = await request(app)
      .get(`/api/expedientes/${expedienteId}/reporte.pdf?desde=2026-03-10&hasta=2026-03-01`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookieAlumno);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RANGO_INVALIDO');
    expect(res.body.error.message).toBe('La fecha inicial no puede ser posterior a la fecha final.');
  });

  it('401 without a session', async () => {
    expect((await pedir(expedienteId, null)).status).toBe(401);
  });

  it('403 for another student', async () => {
    expect((await pedir(expedienteId, cookieOtroAlumno)).status).toBe(403);
  });

  it('RN-03b: vinculación of the other office is denied', async () => {
    expect((await pedir(expedienteId, cookiePracticas)).status).toBe(403);
  });

  it('404 for a case file of another plantel or one that does not exist', async () => {
    expect((await pedir(expedienteId, cookieOtroPlantel)).status).toBe(404);
    expect((await pedir('00000000-0000-4000-8000-000000000000', cookieAdmin)).status).toBe(404);
  });
});
