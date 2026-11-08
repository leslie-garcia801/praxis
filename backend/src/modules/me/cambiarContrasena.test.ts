import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarPlantel, crearPlantel, crearUsuario, iniciarSesion, PASSWORD_PRUEBA } from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;
const NUEVA = 'NuevaClave2026';

describe('POST /api/me/cambiar-contrasena (RF-04)', () => {
  const app = createApp();
  let plantelId: string;

  const cambiar = (cookie: string | undefined, body: object) => {
    const req = request(app).post('/api/me/cambiar-contrasena').set('Origin', ORIGIN).send(body);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  it('RF-04: changing the temporary password clears the pending change and unlocks the app', async () => {
    const user = await crearUsuario({ plantelId, debeCambiar: true });
    const cookie = await iniciarSesion(app, user);

    const res = await cambiar(cookie, { passwordActual: PASSWORD_PRUEBA, passwordNueva: NUEVA });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const actualizado = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(actualizado.debeCambiar).toBe(false);
    // Same session keeps working and is no longer blocked.
    const me = await request(app).get('/api/me').set('Cookie', cookie);
    expect(me.body.usuario.debeCambiar).toBe(false);
  });

  it('the new password signs in and the old one no longer does', async () => {
    const user = await crearUsuario({ plantelId });
    const cookie = await iniciarSesion(app, user);

    await cambiar(cookie, { passwordActual: PASSWORD_PRUEBA, passwordNueva: NUEVA });

    await expect(iniciarSesion(app, user, NUEVA)).resolves.toEqual(expect.any(String));
    await expect(iniciarSesion(app, user, PASSWORD_PRUEBA)).rejects.toThrow(/401/);
  });

  it('closes the other sessions and keeps the current one', async () => {
    const user = await crearUsuario({ plantelId });
    const actual = await iniciarSesion(app, user);
    const otra = await iniciarSesion(app, user);

    await cambiar(actual, { passwordActual: PASSWORD_PRUEBA, passwordNueva: NUEVA });

    expect((await request(app).get('/api/me').set('Cookie', actual)).status).toBe(200);
    expect((await request(app).get('/api/me').set('Cookie', otra)).status).toBe(401);
  });

  it('RF-29: records the change in the audit log without passwords', async () => {
    const user = await crearUsuario({ plantelId });
    const cookie = await iniciarSesion(app, user);

    await cambiar(cookie, { passwordActual: PASSWORD_PRUEBA, passwordNueva: NUEVA });

    const logs = await prisma.auditLog.findMany({ where: { entidadId: user.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ usuarioId: user.id, accion: 'CAMBIAR_CONTRASENA' });
    expect(JSON.stringify(logs[0])).not.toMatch(new RegExp(`${PASSWORD_PRUEBA}|${NUEVA}`));
  });

  it('400 when the current password is wrong', async () => {
    const user = await crearUsuario({ plantelId, debeCambiar: true });
    const cookie = await iniciarSesion(app, user);

    const res = await cambiar(cookie, { passwordActual: 'equivocada', passwordNueva: NUEVA });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONTRASENA_ACTUAL_INCORRECTA');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).debeCambiar).toBe(true);
  });

  it('400 when the new password repeats the current one or is too short', async () => {
    const user = await crearUsuario({ plantelId });
    const cookie = await iniciarSesion(app, user);

    const igual = await cambiar(cookie, { passwordActual: PASSWORD_PRUEBA, passwordNueva: PASSWORD_PRUEBA });
    const corta = await cambiar(cookie, { passwordActual: PASSWORD_PRUEBA, passwordNueva: 'corta' });

    expect(igual.status).toBe(400);
    expect(igual.body.error.code).toBe('VALIDATION_ERROR');
    expect(corta.status).toBe(400);
  });

  it('401 without a session', async () => {
    const res = await cambiar(undefined, { passwordActual: PASSWORD_PRUEBA, passwordNueva: NUEVA });

    expect(res.status).toBe(401);
  });
});
