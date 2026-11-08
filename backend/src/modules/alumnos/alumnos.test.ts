import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearExpediente,
  crearPlantel,
  crearUsuario,
  iniciarSesion,
  PASSWORD_PRUEBA,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;
let ipCounter = 0;
const nextIp = () => `10.60.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

describe('POST /api/alumnos/:id/restablecer-contrasena (RF-04)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let cookieVinculacion: string;
  let cookieAdmin: string;
  let matriculaSeq = 25319051762000;

  const restablecer = (alumnoId: string, cookie?: string) => {
    const req = request(app).post(`/api/alumnos/${alumnoId}/restablecer-contrasena`).set('Origin', ORIGIN);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const signIn = (username: string, password: string) =>
    request(app)
      .post('/api/auth/sign-in/username')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', nextIp())
      .send({ username, password });
  const nuevoAlumno = (opts: { password?: string; plantel?: string } = {}) =>
    crearAlumnoPrecargado({
      plantelId: opts.plantel ?? plantelId,
      matricula: String(matriculaSeq++),
      ...(opts.password && { password: opts.password }),
    });

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    // A Prácticas user: option 1 lets any vinculación user of the campus reset any student.
    cookieVinculacion = await iniciarSesion(
      app,
      await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }),
    );
    cookieAdmin = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ADMIN' }));
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  it('RF-04: vinculación gets a temporary password that signs the student in with a pending change', async () => {
    const alumno = await nuevoAlumno({ password: PASSWORD_PRUEBA });
    await crearExpediente({ alumnoId: alumno.alumno!.id, tipo: 'SERVICIO_SOCIAL' });

    const res = await restablecer(alumno.alumno!.id, cookieVinculacion);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { passwordTemporal } = res.body;
    expect(passwordTemporal).toMatch(/^[A-Za-z2-9]{10}$/);

    expect((await signIn(alumno.username!, passwordTemporal)).status).toBe(200);
    expect((await signIn(alumno.username!, PASSWORD_PRUEBA)).status).toBe(401);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: alumno.id } });
    expect(user.debeCambiar).toBe(true);
  });

  it('RF-04: closes every open session of the student', async () => {
    const alumno = await nuevoAlumno({ password: PASSWORD_PRUEBA });
    const cookieAlumno = await iniciarSesion(app, alumno);

    await restablecer(alumno.alumno!.id, cookieVinculacion);

    expect((await request(app).get('/api/me').set('Cookie', cookieAlumno)).status).toBe(401);
  });

  it('RF-02/RF-04: creates the account when the student never activated it', async () => {
    const alumno = await nuevoAlumno();

    const res = await restablecer(alumno.alumno!.id, cookieVinculacion);

    expect(res.status).toBe(200);
    expect((await signIn(alumno.username!, res.body.passwordTemporal)).status).toBe(200);
  });

  it('RF-29: records who reset it, without the password', async () => {
    const actor = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' });
    const cookie = await iniciarSesion(app, actor);
    const alumno = await nuevoAlumno({ password: PASSWORD_PRUEBA });

    const res = await restablecer(alumno.alumno!.id, cookie);

    const logs = await prisma.auditLog.findMany({ where: { entidadId: alumno.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ usuarioId: actor.id, accion: 'RESTABLECER_CONTRASENA', entidad: 'User' });
    expect(JSON.stringify(logs[0])).not.toContain(res.body.passwordTemporal);
  });

  it('the administrator can reset it too', async () => {
    const alumno = await nuevoAlumno({ password: PASSWORD_PRUEBA });

    expect((await restablecer(alumno.alumno!.id, cookieAdmin)).status).toBe(200);
  });

  it('401 without a session', async () => {
    const alumno = await nuevoAlumno();

    expect((await restablecer(alumno.alumno!.id)).status).toBe(401);
  });

  it('403 for a student', async () => {
    const alumno = await nuevoAlumno();
    const otro = await nuevoAlumno({ password: PASSWORD_PRUEBA });
    const cookie = await iniciarSesion(app, otro);

    const res = await restablecer(alumno.alumno!.id, cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('400 for an invalid id', async () => {
    const res = await restablecer('no-es-un-uuid', cookieVinculacion);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('404 for an unknown student', async () => {
    const res = await restablecer('7c9e6679-7425-40de-944b-e07fc1f90ae7', cookieVinculacion);

    expect(res.status).toBe(404);
  });

  it('404 for a student of another campus', async () => {
    const ajeno = await nuevoAlumno({ plantel: otroPlantelId });

    expect((await restablecer(ajeno.alumno!.id, cookieVinculacion)).status).toBe(404);
  });
});
