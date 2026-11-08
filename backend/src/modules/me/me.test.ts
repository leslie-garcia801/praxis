import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearExpediente,
  crearInstitucion,
  crearPlantel,
  crearUsuario,
  iniciarSesion,
  PASSWORD_PRUEBA,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

describe('GET /api/me', () => {
  const app = createApp();
  let plantelId: string;

  const alumnoConExpediente = async (matricula: string) => {
    const user = await crearAlumnoPrecargado({ plantelId, matricula, password: PASSWORD_PRUEBA });
    return { user, cookie: await iniciarSesion(app, user) };
  };

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  it('401 without a session', async () => {
    const res = await request(app).get('/api/me');

    expect(res.status).toBe(401);
  });

  it('returns the student profile and the active case file', async () => {
    const { user, cookie } = await alumnoConExpediente('25319051761001');
    const institucion = await crearInstitucion({ plantelId, nombre: 'Hospital Universitario' });
    await crearExpediente({ alumnoId: user.alumno!.id, estado: 'FINALIZADO', tipo: 'PRACTICAS' });
    const activo = await crearExpediente({
      alumnoId: user.alumno!.id,
      tipo: 'SERVICIO_SOCIAL',
      estado: 'EN_PROCESO',
      institucionId: institucion.id,
      fechaInicio: new Date('2026-08-24'),
    });

    const res = await request(app).get('/api/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      usuario: {
        id: user.id,
        nombre: 'Ana María López García',
        email: null,
        matricula: '25319051761001',
        rol: 'ALUMNO',
        oficina: null,
        debeCambiar: false,
      },
      alumno: {
        nombre: 'Ana María',
        apellidoPaterno: 'López',
        apellidoMaterno: 'García',
        carrera: expect.any(String),
        semestre: 5,
        grupo: 'A',
        turno: 'MATUTINO',
      },
      expedienteActivo: {
        id: activo.id,
        tipo: 'SERVICIO_SOCIAL',
        estado: 'EN_PROCESO',
        metaHoras: 480,
        fechaInicio: '2026-08-24',
        fechaTermino: null,
        institucion: { id: institucion.id, nombre: 'Hospital Universitario' },
      },
    });
  });

  it('RN-03: a pending or suspended case file also counts as active', async () => {
    const { user, cookie } = await alumnoConExpediente('25319051761002');
    await crearExpediente({ alumnoId: user.alumno!.id, estado: 'SUSPENDIDO' });

    const res = await request(app).get('/api/me').set('Cookie', cookie);

    expect(res.body.expedienteActivo).toMatchObject({ estado: 'SUSPENDIDO', institucion: null });
  });

  it('expedienteActivo is null when every case file is closed', async () => {
    const { user, cookie } = await alumnoConExpediente('25319051761003');
    await crearExpediente({ alumnoId: user.alumno!.id, estado: 'CANCELADO' });

    const res = await request(app).get('/api/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.expedienteActivo).toBeNull();
  });

  it('shows the real email once the student provides one', async () => {
    const { user, cookie } = await alumnoConExpediente('25319051761004');
    await prisma.user.update({ where: { id: user.id }, data: { email: 'ana@gmail.com' } });

    const res = await request(app).get('/api/me').set('Cookie', cookie);

    expect(res.body.usuario.email).toBe('ana@gmail.com');
  });

  it('RN-03b: a vinculación user gets their office and no student data', async () => {
    const user = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' });
    const cookie = await iniciarSesion(app, user);

    const res = await request(app).get('/api/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.usuario).toMatchObject({ rol: 'VINCULACION', oficina: 'PRACTICAS', matricula: null });
    expect(res.body.alumno).toBeNull();
    expect(res.body.expedienteActivo).toBeNull();
  });

  it('RF-04: works with a pending password change so the app can ask for a new one', async () => {
    const user = await crearUsuario({ plantelId, debeCambiar: true });
    const cookie = await iniciarSesion(app, user);

    const res = await request(app).get('/api/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.usuario.debeCambiar).toBe(true);
  });

  it('403 for a deactivated account', async () => {
    const user = await crearUsuario({ plantelId });
    const cookie = await iniciarSesion(app, user);
    await prisma.user.update({ where: { id: user.id }, data: { activo: false } });

    const res = await request(app).get('/api/me').set('Cookie', cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CUENTA_INACTIVA');
  });
});
