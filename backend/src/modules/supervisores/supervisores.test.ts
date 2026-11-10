import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearExpediente,
  crearInstitucion,
  crearPlantel,
  crearSupervisor,
  crearUsuario,
  iniciarSesion,
  PASSWORD_PRUEBA,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

describe('supervisores (RF-09)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let vinculacionId: string;
  let alumnoUsuarioId: string;
  let cookieVinculacion: string;
  let cookieOtroPlantel: string;
  let cookieAdmin: string;
  let cookieAlumno: string;
  let institucionId: string;
  let institucionInactivaId: string;
  let institucionAjenaId: string;

  // `null` means no session cookie (undefined would fall back to the vinculación cookie).
  const pedir = (metodo: 'get' | 'post' | 'patch', ruta: string, body?: object, cookie: string | null = cookieVinculacion) => {
    const req = request(app)[metodo](`/api${ruta}`).set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    return body ? req.send(body) : req;
  };
  const alta = (extra: object = {}) => ({ nombre: 'Roberto', apellidoPaterno: 'Salinas', correo: `Jefe-${randomUUID()}@Empresa.com`, ...extra });
  const listar = (id = institucionId, cookie: string | null = cookieVinculacion) => pedir('get', `/instituciones/${id}/supervisores`, undefined, cookie);
  const crear = (body: object = alta(), id = institucionId, cookie: string | null = cookieVinculacion) =>
    pedir('post', `/instituciones/${id}/supervisores`, body, cookie);
  const editar = (id: string, body: object, cookie: string | null = cookieVinculacion) => pedir('patch', `/supervisores/${id}`, body, cookie);

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    const vinculacion = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' });
    vinculacionId = vinculacion.id;
    cookieVinculacion = await iniciarSesion(app, vinculacion);
    cookieOtroPlantel = await iniciarSesion(app, await crearUsuario({ plantelId: otroPlantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
    cookieAdmin = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ADMIN' }));
    const alumno = await crearAlumnoPrecargado({ plantelId, matricula: '25319051762001', password: PASSWORD_PRUEBA });
    alumnoUsuarioId = alumno.id;
    cookieAlumno = await iniciarSesion(app, alumno);
    institucionId = (await crearInstitucion({ plantelId })).id;
    institucionInactivaId = (await crearInstitucion({ plantelId, datos: { activa: false } })).id;
    institucionAjenaId = (await crearInstitucion({ plantelId: otroPlantelId })).id;
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  describe('GET /api/instituciones/:id/supervisores', () => {
    it('RF-09: vinculación sees every supervisor with all fields, pending ones included', async () => {
      const inst = (await crearInstitucion({ plantelId })).id;
      const confirmado = await crearSupervisor({ institucionId: inst, datos: { nombre: 'Ana', telefono: '8112345678', extension: '12', puesto: 'Jefa' } });
      const pendiente = await crearSupervisor({ institucionId: inst, datos: { nombre: 'Beto', confirmado: false } });

      const res = await listar(inst);

      expect(res.status).toBe(200);
      expect(res.body.supervisores).toHaveLength(2);
      expect(res.body.supervisores).toContainEqual({
        id: confirmado.id,
        institucionId: inst,
        titulo: null,
        nombre: 'Ana',
        apellidoPaterno: 'Mendoza',
        apellidoMaterno: null,
        puesto: 'Jefa',
        departamento: null,
        correo: confirmado.correo,
        telefono: '8112345678',
        extension: '12',
        confirmado: true,
      });
      expect(res.body.supervisores.map((s: { id: string }) => s.id)).toContain(pendiente.id);
    });

    it('RF-09: ADMIN sees all fields too', async () => {
      const inst = (await crearInstitucion({ plantelId })).id;
      const s = await crearSupervisor({ institucionId: inst });

      const res = await listar(inst, cookieAdmin);

      expect(res.status).toBe(200);
      expect(res.body.supervisores[0]).toMatchObject({ id: s.id, correo: s.correo });
    });

    it('RF-09: the student only sees confirmed supervisors, without correo, telefono or extension', async () => {
      const inst = (await crearInstitucion({ plantelId })).id;
      const confirmado = await crearSupervisor({ institucionId: inst, datos: { nombre: 'Ana', puesto: 'Jefa', departamento: 'RH', telefono: '811', extension: '9' } });
      await crearSupervisor({ institucionId: inst, datos: { nombre: 'Beto', confirmado: false } });

      const res = await listar(inst, cookieAlumno);

      expect(res.status).toBe(200);
      expect(res.body.supervisores).toEqual([
        {
          id: confirmado.id,
          institucionId: inst,
          titulo: null,
          nombre: 'Ana',
          apellidoPaterno: 'Mendoza',
          apellidoMaterno: null,
          puesto: 'Jefa',
          departamento: 'RH',
          confirmado: true,
        },
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/correo|telefono|extension|811/);
    });

    it('RF-09: the student also sees the pending supervisor of their own active case file (limited fields)', async () => {
      const alumno = await crearAlumnoPrecargado({ plantelId, matricula: '25319051762002', password: PASSWORD_PRUEBA });
      const cookie = await iniciarSesion(app, alumno);
      const inst = (await crearInstitucion({ plantelId })).id;
      const propio = await crearSupervisor({ institucionId: inst, datos: { nombre: 'Propio', confirmado: false } });
      await crearSupervisor({ institucionId: inst, datos: { nombre: 'Ajeno', confirmado: false } });
      await crearExpediente({ alumnoId: alumno.alumno!.id, estado: 'PENDIENTE', institucionId: inst, datos: { supervisorId: propio.id } });

      const res = await listar(inst, cookie);

      expect(res.status).toBe(200);
      expect(res.body.supervisores).toHaveLength(1);
      expect(res.body.supervisores[0]).toMatchObject({ id: propio.id, nombre: 'Propio', confirmado: false });
      expect(res.body.supervisores[0]).not.toHaveProperty('correo');
    });

    it('RF-09: the student does not see a pending supervisor from a finished case file', async () => {
      const alumno = await crearAlumnoPrecargado({ plantelId, matricula: '25319051762003', password: PASSWORD_PRUEBA });
      const cookie = await iniciarSesion(app, alumno);
      const inst = (await crearInstitucion({ plantelId })).id;
      const viejo = await crearSupervisor({ institucionId: inst, datos: { confirmado: false } });
      await crearExpediente({ alumnoId: alumno.alumno!.id, estado: 'CANCELADO', institucionId: inst, datos: { supervisorId: viejo.id } });

      const res = await listar(inst, cookie);

      expect(res.body.supervisores).toEqual([]);
    });

    it('RF-05: the student gets 404 for an inactive institution', async () => {
      expect((await listar(institucionInactivaId, cookieAlumno)).status).toBe(404);
    });

    it('vinculación can list the supervisors of an inactive institution', async () => {
      expect((await listar(institucionInactivaId)).status).toBe(200);
    });

    it('404 for an institution of another plantel and for a missing one', async () => {
      expect((await listar(institucionAjenaId)).status).toBe(404);
      expect((await listar(randomUUID())).status).toBe(404);
    });

    it('400 for a non-uuid institution id', async () => {
      const res = await listar('abc');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('401 without a session', async () => {
      expect((await listar(institucionId, null)).status).toBe(401);
    });
  });

  describe('POST /api/instituciones/:id/supervisores', () => {
    it('RF-09: the student creates a pending supervisor and only gets the limited fields back', async () => {
      const res = await crear(alta({ nombre: ' Carlos ', titulo: 'Ing.', puesto: 'Gerente', telefono: '81 1234 5678' }), institucionId, cookieAlumno);

      expect(res.status).toBe(201);
      expect(res.body.supervisor).toMatchObject({ nombre: 'Carlos', titulo: 'Ing.', puesto: 'Gerente', confirmado: false, institucionId });
      expect(res.body.supervisor).not.toHaveProperty('correo');
      expect(res.body.supervisor).not.toHaveProperty('telefono');

      const fila = await prisma.supervisor.findUniqueOrThrow({ where: { id: res.body.supervisor.id } });
      expect(fila).toMatchObject({ confirmado: false, institucionId, telefono: '81 1234 5678' });
      expect(fila.correo).toBe(fila.correo.toLowerCase());
    });

    it('RF-09: vinculación creates the supervisor already confirmed, with all fields', async () => {
      const body = alta({ puesto: 'Directora', departamento: 'Sistemas', extension: '101' });
      const res = await crear(body);

      expect(res.status).toBe(201);
      expect(res.body.supervisor).toMatchObject({
        confirmado: true,
        departamento: 'Sistemas',
        extension: '101',
        correo: body.correo.toLowerCase(),
      });
    });

    it('RF-09: ADMIN creates a confirmed supervisor', async () => {
      const res = await crear(alta(), institucionId, cookieAdmin);

      expect(res.status).toBe(201);
      expect(res.body.supervisor.confirmado).toBe(true);
    });

    it('RF-29: audits CREAR_SUPERVISOR with who and the new values', async () => {
      const res = await crear(alta({ nombre: 'Auditado' }));

      const logs = await prisma.auditLog.findMany({ where: { entidadId: res.body.supervisor.id } });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ usuarioId: vinculacionId, accion: 'CREAR_SUPERVISOR', entidad: 'Supervisor', antes: null });
      expect(logs[0]?.despues).toMatchObject({ nombre: 'Auditado', institucionId, confirmado: true });
    });

    it('RF-29: audits the student as author of a pending supervisor', async () => {
      const res = await crear(alta(), institucionId, cookieAlumno);

      const log = await prisma.auditLog.findFirstOrThrow({ where: { entidadId: res.body.supervisor.id } });
      expect(log).toMatchObject({ usuarioId: alumnoUsuarioId, accion: 'CREAR_SUPERVISOR' });
      expect(log.despues).toMatchObject({ confirmado: false });
    });

    it.each([
      ['missing nombre', { apellidoPaterno: 'x', correo: 'a@b.com' }],
      ['empty nombre', { nombre: '  ', apellidoPaterno: 'x', correo: 'a@b.com' }],
      ['missing apellidoPaterno', { nombre: 'x', correo: 'a@b.com' }],
      ['missing correo', { nombre: 'x', apellidoPaterno: 'x' }],
      ['invalid correo', { nombre: 'x', apellidoPaterno: 'x', correo: 'no-es-correo' }],
    ])('400 for %s', async (_caso, body) => {
      const res = await crear(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('404 for an institution of another plantel and for a missing one', async () => {
      expect((await crear(alta(), institucionAjenaId)).status).toBe(404);
      expect((await crear(alta(), randomUUID())).status).toBe(404);
    });

    it('RF-05: the student gets 404 creating a supervisor in an inactive institution', async () => {
      expect((await crear(alta(), institucionInactivaId, cookieAlumno)).status).toBe(404);
    });

    it('401 without a session', async () => {
      expect((await crear(alta(), institucionId, null)).status).toBe(401);
    });

    it('404 for vinculación of another plantel', async () => {
      expect((await crear(alta(), institucionId, cookieOtroPlantel)).status).toBe(404);
    });
  });

  describe('PATCH /api/supervisores/:id', () => {
    it('RF-09: vinculación edits fields and can clear optional ones', async () => {
      const s = await crearSupervisor({ institucionId, datos: { puesto: 'Jefe', telefono: '811' } });

      const res = await editar(s.id, { puesto: 'Director', telefono: null, correo: 'NUEVO@Empresa.com' });

      expect(res.status).toBe(200);
      expect(res.body.supervisor).toMatchObject({ id: s.id, puesto: 'Director', telefono: null, correo: 'nuevo@empresa.com', confirmado: true });
    });

    it('RF-09: ADMIN can edit', async () => {
      const s = await crearSupervisor({ institucionId });

      expect((await editar(s.id, { nombre: 'Editado' }, cookieAdmin)).status).toBe(200);
    });

    it('RF-09: editing never changes confirmado or the institution', async () => {
      const s = await crearSupervisor({ institucionId, datos: { confirmado: false } });

      const res = await editar(s.id, { nombre: 'Otro', confirmado: true, institucionId: institucionInactivaId });

      expect(res.status).toBe(200);
      const fila = await prisma.supervisor.findUniqueOrThrow({ where: { id: s.id } });
      expect(fila).toMatchObject({ nombre: 'Otro', confirmado: false, institucionId });
    });

    it('RF-29: audits EDITAR_SUPERVISOR with previous and new values of what changed', async () => {
      const s = await crearSupervisor({ institucionId, datos: { puesto: 'Jefe' } });

      await editar(s.id, { puesto: 'Director', nombre: s.nombre });

      const logs = await prisma.auditLog.findMany({ where: { entidadId: s.id } });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ usuarioId: vinculacionId, accion: 'EDITAR_SUPERVISOR', entidad: 'Supervisor', antes: { puesto: 'Jefe' }, despues: { puesto: 'Director' } });
    });

    it('RF-29: no audit entry when nothing changed', async () => {
      const s = await crearSupervisor({ institucionId, datos: { puesto: 'Jefe' } });

      const res = await editar(s.id, { puesto: 'Jefe' });

      expect(res.status).toBe(200);
      expect(await prisma.auditLog.count({ where: { entidadId: s.id } })).toBe(0);
    });

    it.each([
      ['empty body', {}],
      ['empty nombre', { nombre: '  ' }],
      ['null nombre', { nombre: null }],
      ['invalid correo', { correo: 'no-es-correo' }],
      ['null correo', { correo: null }],
    ])('400 for %s', async (_caso, body) => {
      const s = await crearSupervisor({ institucionId });

      const res = await editar(s.id, body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('400 for a non-uuid id', async () => {
      expect((await editar('abc', { nombre: 'x' })).status).toBe(400);
    });

    it('404 for a supervisor of another plantel and for a missing one', async () => {
      const ajeno = await crearSupervisor({ institucionId: institucionAjenaId });

      expect((await editar(ajeno.id, { nombre: 'x' })).status).toBe(404);
      expect((await editar(randomUUID(), { nombre: 'x' })).status).toBe(404);
      expect((await editar((await crearSupervisor({ institucionId })).id, { nombre: 'x' }, cookieOtroPlantel)).status).toBe(404);
    });

    it('401 without a session', async () => {
      const s = await crearSupervisor({ institucionId });

      expect((await editar(s.id, { nombre: 'x' }, null)).status).toBe(401);
    });

    it('403 for ALUMNO', async () => {
      const s = await crearSupervisor({ institucionId });

      const res = await editar(s.id, { nombre: 'x' }, cookieAlumno);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
