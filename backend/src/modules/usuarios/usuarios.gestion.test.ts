import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarPlantel, crearPlantel, crearUsuario, iniciarSesion, PASSWORD_PRUEBA } from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { editarUsuario } from './usuarios.service.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;
const ID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

// Shared setup for the user-management routes (RN-03b, RF-04, RF-29).
function montarEscenario() {
  const app = createApp();
  const ctx = {
    app,
    plantelId: '',
    otroPlantelId: '',
    admin: null as unknown as Awaited<ReturnType<typeof crearUsuario>>,
    cookieAdmin: '',
  };

  beforeAll(async () => {
    ctx.plantelId = (await crearPlantel()).id;
    ctx.otroPlantelId = (await crearPlantel()).id;
    ctx.admin = await crearUsuario({ plantelId: ctx.plantelId, rol: 'ADMIN' });
    ctx.cookieAdmin = await iniciarSesion(app, ctx.admin);
  });

  afterAll(async () => {
    await borrarPlantel(ctx.plantelId);
    await borrarPlantel(ctx.otroPlantelId);
    await prisma.$disconnect();
  });

  // `null` means no session cookie (undefined would fall back to the admin's cookie).
  const llamar = (metodo: 'get' | 'patch' | 'post', ruta: string, body?: object, cookie: string | null = ctx.cookieAdmin) => {
    const req = request(app)[metodo](ruta).set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    return body === undefined ? req : req.send(body);
  };

  return { ctx, llamar };
}

describe('GET /api/usuarios (§4, RN-03b)', () => {
  const { ctx, llamar } = montarEscenario();

  it('§4: lists the staff of the campus with the agreed fields, active first and then by name', async () => {
    const plantelId = (await crearPlantel()).id;
    try {
      const admin = await crearUsuario({ plantelId, rol: 'ADMIN' });
      const cookie = await iniciarSesion(ctx.app, admin);
      const activaB = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' });
      const activaA = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: null });
      const inactiva = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL', activo: false, debeCambiar: true });
      await prisma.user.update({ where: { id: admin.id }, data: { name: 'Zeta Admin' } });
      await prisma.user.update({ where: { id: activaB.id }, data: { name: 'Beto' } });
      const ana = await prisma.user.update({ where: { id: activaA.id }, data: { name: 'Ana' } });
      await prisma.user.update({ where: { id: inactiva.id }, data: { name: 'Aaron' } });

      const res = await llamar('get', '/api/usuarios', undefined, cookie);

      expect(res.status).toBe(200);
      expect(res.body.usuarios.map((u: { nombre: string }) => u.nombre)).toEqual(['Ana', 'Beto', 'Zeta Admin', 'Aaron']);
      expect(res.body.usuarios[0]).toEqual({
        id: ana.id,
        nombre: 'Ana',
        email: ana.email,
        rol: 'VINCULACION',
        oficina: null,
        activo: true,
        debeCambiar: false,
        creadoEn: ana.createdAt.toISOString(),
      });
      expect(res.body.usuarios[2]).toMatchObject({ rol: 'ADMIN', oficina: null });
      expect(res.body.usuarios[3]).toMatchObject({ activo: false, debeCambiar: true, oficina: 'SERVICIO_SOCIAL' });
    } finally {
      await borrarPlantel(plantelId);
    }
  });

  it('§4: never includes students, other campuses or auth internals', async () => {
    const alumno = await crearUsuario({ plantelId: ctx.plantelId, rol: 'ALUMNO' });
    const ajeno = await crearUsuario({ plantelId: ctx.otroPlantelId, rol: 'VINCULACION' });

    const res = await llamar('get', '/api/usuarios');

    const ids = res.body.usuarios.map((u: { id: string }) => u.id);
    expect(ids).toContain(ctx.admin.id);
    expect(ids).not.toContain(alumno.id);
    expect(ids).not.toContain(ajeno.id);
    expect(res.body.usuarios.every((u: { rol: string }) => u.rol !== 'ALUMNO')).toBe(true);
    expect(Object.keys(res.body.usuarios[0]).sort()).toEqual(
      ['activo', 'creadoEn', 'debeCambiar', 'email', 'id', 'nombre', 'oficina', 'rol'],
    );
    expect(JSON.stringify(res.body)).not.toMatch(/password|plantelId|username/);
  });

  it('401 without a session', async () => {
    expect((await llamar('get', '/api/usuarios', undefined, null)).status).toBe(401);
  });

  it.each(['VINCULACION', 'ALUMNO'] as const)('§4: 403 for %s', async (rol) => {
    const cookie = await iniciarSesion(ctx.app, await crearUsuario({ plantelId: ctx.plantelId, rol }));

    const res = await llamar('get', '/api/usuarios', undefined, cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('PATCH /api/usuarios/:id (§4, RN-03b, RF-29)', () => {
  const { ctx, llamar } = montarEscenario();
  const editar = (id: string, body: object, cookie: string | null = ctx.cookieAdmin) =>
    llamar('patch', `/api/usuarios/${id}`, body, cookie);
  const vinculacion = (extra: { oficina?: 'PRACTICAS' | 'SERVICIO_SOCIAL' | null; activo?: boolean } = {}) =>
    crearUsuario({ plantelId: ctx.plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS', ...extra });

  it('RN-03b: changes the name and the office of a vinculación user and returns the item', async () => {
    const objetivo = await vinculacion();

    const res = await editar(objetivo.id, { nombre: '  Nuevo Nombre ', oficina: 'SERVICIO_SOCIAL' });

    expect(res.status).toBe(200);
    expect(res.body.usuario).toMatchObject({
      id: objetivo.id,
      nombre: 'Nuevo Nombre',
      email: objetivo.email,
      rol: 'VINCULACION',
      oficina: 'SERVICIO_SOCIAL',
      activo: true,
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: objetivo.id } });
    expect(user).toMatchObject({ name: 'Nuevo Nombre', oficina: 'SERVICIO_SOCIAL' });
  });

  it('RN-03b: oficina null gives the user access to both offices', async () => {
    const objetivo = await vinculacion();

    const res = await editar(objetivo.id, { oficina: null });

    expect(res.status).toBe(200);
    expect(res.body.usuario.oficina).toBeNull();
  });

  it('RN-03b: the new office applies to the user right away', async () => {
    const objetivo = await vinculacion({ oficina: 'PRACTICAS' });
    const cookie = await iniciarSesion(ctx.app, objetivo);
    await editar(objetivo.id, { oficina: 'SERVICIO_SOCIAL' });

    const me = await request(ctx.app).get('/api/me').set('Cookie', cookie);

    expect(me.body.usuario.oficina).toBe('SERVICIO_SOCIAL');
  });

  it('§4: 400 when sending oficina for an ADMIN target', async () => {
    const otroAdmin = await crearUsuario({ plantelId: ctx.plantelId, rol: 'ADMIN' });

    const res = await editar(otroAdmin.id, { oficina: 'PRACTICAS' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OFICINA_NO_APLICA');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: otroAdmin.id } })).oficina).toBeNull();
  });

  it('§4: an admin target can be renamed', async () => {
    const otroAdmin = await crearUsuario({ plantelId: ctx.plantelId, rol: 'ADMIN' });

    const res = await editar(otroAdmin.id, { nombre: 'Otro Admin' });

    expect(res.status).toBe(200);
    expect(res.body.usuario).toMatchObject({ nombre: 'Otro Admin', rol: 'ADMIN', oficina: null });
  });

  it('RF-29: records only the changed fields, before and after, by the admin', async () => {
    const objetivo = await vinculacion();
    await prisma.user.update({ where: { id: objetivo.id }, data: { name: 'Antes' } });

    await editar(objetivo.id, { nombre: 'Después', oficina: 'PRACTICAS' });

    const logs = await prisma.auditLog.findMany({ where: { entidadId: objetivo.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      usuarioId: ctx.admin.id,
      accion: 'EDITAR_USUARIO',
      entidad: 'User',
      antes: { nombre: 'Antes' },
      despues: { nombre: 'Después' },
    });
  });

  it('RF-29: no audit entry when nothing changes', async () => {
    const objetivo = await vinculacion();

    const res = await editar(objetivo.id, { oficina: 'PRACTICAS', activo: true });

    expect(res.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { entidadId: objetivo.id } })).toBe(0);
  });

  it('§4: deactivating signs the user out right away and blocks new sign-ins', async () => {
    const objetivo = await vinculacion();
    const cookie = await iniciarSesion(ctx.app, objetivo);
    expect(await prisma.session.count({ where: { userId: objetivo.id } })).toBe(1);

    const res = await editar(objetivo.id, { activo: false });

    expect(res.status).toBe(200);
    expect(res.body.usuario.activo).toBe(false);
    expect(await prisma.session.count({ where: { userId: objetivo.id } })).toBe(0);

    const me = await request(ctx.app).get('/api/me').set('Cookie', cookie);
    expect(me.status).toBe(401);

    await expect(iniciarSesion(ctx.app, objetivo)).rejects.toThrow(/403/);
  });

  it('RF-29: deactivating is audited with before and after', async () => {
    const objetivo = await vinculacion();

    await editar(objetivo.id, { activo: false });

    const log = await prisma.auditLog.findFirstOrThrow({ where: { entidadId: objetivo.id } });
    expect(log).toMatchObject({ accion: 'EDITAR_USUARIO', antes: { activo: true }, despues: { activo: false } });
  });

  it('§4: reactivating is allowed and the user can sign in again', async () => {
    const objetivo = await vinculacion({ activo: false });

    const res = await editar(objetivo.id, { activo: true });

    expect(res.status).toBe(200);
    expect(res.body.usuario.activo).toBe(true);
    await expect(iniciarSesion(ctx.app, objetivo)).resolves.toEqual(expect.any(String));
  });

  it('§4: 409 when the admin deactivates themselves', async () => {
    const res = await editar(ctx.admin.id, { activo: false });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_PUEDES_DESACTIVARTE');
    expect(res.body.error.message).toMatch(/tu propia cuenta/i);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ctx.admin.id } })).activo).toBe(true);
  });

  it('§4: the admin can still rename themselves', async () => {
    const res = await editar(ctx.admin.id, { nombre: 'Admin Renombrado' });

    expect(res.status).toBe(200);
    expect(res.body.usuario.nombre).toBe('Admin Renombrado');
  });

  it('§4: an admin can deactivate another admin when one remains active', async () => {
    const otroAdmin = await crearUsuario({ plantelId: ctx.plantelId, rol: 'ADMIN' });

    const res = await editar(otroAdmin.id, { activo: false });

    expect(res.status).toBe(200);
    expect(res.body.usuario.activo).toBe(false);
  });

  it('§4: 409 when the target is the last active admin of the campus', async () => {
    const plantelId = (await crearPlantel()).id;
    try {
      const unico = await crearUsuario({ plantelId, rol: 'ADMIN' });
      // An actor that is not an active admin of the campus (e.g. deactivated after authenticating).
      const inactivo = await crearUsuario({ plantelId, rol: 'ADMIN', activo: false });
      const actor = { ...inactivo, name: inactivo.name, username: null, oficina: null };

      await expect(editarUsuario(actor, unico.id, { activo: false })).rejects.toMatchObject({
        status: 409,
        code: 'ULTIMO_ADMIN',
      });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: unico.id } })).activo).toBe(true);
    } finally {
      await borrarPlantel(plantelId);
    }
  });

  it('§4: two admins deactivating each other at once never leave the campus without an active admin', async () => {
    const plantelId = (await crearPlantel()).id;
    try {
      const a = await crearUsuario({ plantelId, rol: 'ADMIN' });
      const b = await crearUsuario({ plantelId, rol: 'ADMIN' });
      const cookieA = await iniciarSesion(ctx.app, a);
      const cookieB = await iniciarSesion(ctx.app, b);

      const [r1, r2] = await Promise.all([
        editar(b.id, { activo: false }, cookieA),
        editar(a.id, { activo: false }, cookieB),
      ]);

      expect([r1.status, r2.status].filter((s) => s === 200)).toHaveLength(1);
      expect(await prisma.user.count({ where: { plantelId, rol: 'ADMIN', activo: true } })).toBe(1);
    } finally {
      await borrarPlantel(plantelId);
    }
  });

  it('§4: 404 for a student target, without revealing it exists', async () => {
    const alumno = await crearUsuario({ plantelId: ctx.plantelId, rol: 'ALUMNO' });

    const res = await editar(alumno.id, { activo: false });

    expect(res.status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alumno.id } })).activo).toBe(true);
  });

  it('§4: 404 for a user of another campus', async () => {
    const ajeno = await crearUsuario({ plantelId: ctx.otroPlantelId, rol: 'VINCULACION' });

    const res = await editar(ajeno.id, { nombre: 'Intruso' });

    expect(res.status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ajeno.id } })).name).not.toBe('Intruso');
  });

  it('§4: 404 for an unknown id', async () => {
    expect((await editar(ID_INEXISTENTE, { activo: false })).status).toBe(404);
  });

  it.each([
    ['empty body', {}],
    ['empty name', { nombre: '   ' }],
    ['name too long', { nombre: 'x'.repeat(151) }],
    ['unknown office', { oficina: 'TITULACION' }],
    ['activo is not a boolean', { activo: 'no' }],
    ['email is not editable', { email: 'otro@cbtis258.edu.mx' }],
    ['rol is not editable', { rol: 'ADMIN' }],
  ])('§4: 400 for %s', async (_caso, body) => {
    const objetivo = await vinculacion();

    const res = await editar(objetivo.id, body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('§4: 400 for an invalid id', async () => {
    const res = await editar('no-es-uuid', { activo: false });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('401 without a session', async () => {
    const objetivo = await vinculacion();

    expect((await editar(objetivo.id, { activo: false }, null)).status).toBe(401);
  });

  it.each(['VINCULACION', 'ALUMNO'] as const)('§4: 403 for %s', async (rol) => {
    const objetivo = await vinculacion();
    const cookie = await iniciarSesion(ctx.app, await crearUsuario({ plantelId: ctx.plantelId, rol }));

    const res = await editar(objetivo.id, { activo: false }, cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: objetivo.id } })).activo).toBe(true);
  });
});

describe('POST /api/usuarios/:id/restablecer-contrasena (RF-04, RF-29)', () => {
  const { ctx, llamar } = montarEscenario();
  const restablecer = (id: string, cookie: string | null = ctx.cookieAdmin) =>
    llamar('post', `/api/usuarios/${id}/restablecer-contrasena`, undefined, cookie);
  const vinculacion = (extra: { activo?: boolean } = {}) =>
    crearUsuario({ plantelId: ctx.plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS', ...extra });

  it('RF-04: returns a temporary password once, the user signs in with it and must change it', async () => {
    const objetivo = await vinculacion();

    const res = await restablecer(objetivo.id);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.passwordTemporal).toMatch(/^[A-Za-z2-9]{10}$/);

    const cookie = await iniciarSesion(ctx.app, objetivo, res.body.passwordTemporal);
    const me = await request(ctx.app).get('/api/me').set('Cookie', cookie);
    expect(me.body.usuario).toMatchObject({ debeCambiar: true });
  });

  it('RF-04: the old password stops working', async () => {
    const objetivo = await vinculacion();
    await restablecer(objetivo.id);

    await expect(iniciarSesion(ctx.app, objetivo, PASSWORD_PRUEBA)).rejects.toThrow(/401/);
  });

  it('RF-04: revokes the sessions of the target', async () => {
    const objetivo = await vinculacion();
    const cookie = await iniciarSesion(ctx.app, objetivo);

    await restablecer(objetivo.id);

    expect(await prisma.session.count({ where: { userId: objetivo.id } })).toBe(0);
    expect((await request(ctx.app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('RF-04: works for another admin of the campus', async () => {
    const otroAdmin = await crearUsuario({ plantelId: ctx.plantelId, rol: 'ADMIN' });

    const res = await restablecer(otroAdmin.id);

    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: otroAdmin.id } })).debeCambiar).toBe(true);
  });

  it('RF-04: a deactivated user can be reset; the password applies once reactivated', async () => {
    const objetivo = await vinculacion({ activo: false });

    const res = await restablecer(objetivo.id);
    expect(res.status).toBe(200);
    await expect(iniciarSesion(ctx.app, objetivo, res.body.passwordTemporal)).rejects.toThrow(/403/);

    await prisma.user.update({ where: { id: objetivo.id }, data: { activo: true } });
    await expect(iniciarSesion(ctx.app, objetivo, res.body.passwordTemporal)).resolves.toEqual(expect.any(String));
  });

  it('RF-29: audits the reset without the password', async () => {
    const objetivo = await vinculacion();

    const res = await restablecer(objetivo.id);

    const logs = await prisma.auditLog.findMany({ where: { entidadId: objetivo.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ usuarioId: ctx.admin.id, accion: 'RESTABLECER_CONTRASENA', entidad: 'User' });
    expect(JSON.stringify(logs[0])).not.toContain(res.body.passwordTemporal);
  });

  it('RF-04: 409 when the admin resets their own password (they use "Cambiar contraseña")', async () => {
    const res = await restablecer(ctx.admin.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USA_CAMBIAR_CONTRASENA');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ctx.admin.id } })).debeCambiar).toBe(false);
  });

  it('RF-04: 404 for a student target', async () => {
    const alumno = await crearUsuario({ plantelId: ctx.plantelId, rol: 'ALUMNO' });

    expect((await restablecer(alumno.id)).status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alumno.id } })).debeCambiar).toBe(false);
  });

  it('RF-04: 404 for a user of another campus', async () => {
    const ajeno = await crearUsuario({ plantelId: ctx.otroPlantelId, rol: 'VINCULACION' });

    expect((await restablecer(ajeno.id)).status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ajeno.id } })).debeCambiar).toBe(false);
  });

  it('RF-04: 404 for an unknown id', async () => {
    expect((await restablecer(ID_INEXISTENTE)).status).toBe(404);
  });

  it('RF-04: 400 for an invalid id', async () => {
    const res = await restablecer('no-es-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('401 without a session', async () => {
    const objetivo = await vinculacion();

    expect((await restablecer(objetivo.id, null)).status).toBe(401);
  });

  it.each(['VINCULACION', 'ALUMNO'] as const)('RF-04: 403 for %s', async (rol) => {
    const objetivo = await vinculacion();
    const cookie = await iniciarSesion(ctx.app, await crearUsuario({ plantelId: ctx.plantelId, rol }));

    const res = await restablecer(objetivo.id, cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: objetivo.id } })).debeCambiar).toBe(false);
  });
});
