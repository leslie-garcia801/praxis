import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EstadoExpediente, TipoPrograma } from '../../generated/prisma/enums.js';
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

describe('expedientes (RF-10, RF-11)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let vinculacionPracticasId: string;
  let cookiePracticas: string;
  let cookieServicio: string;
  let cookieAdmin: string;
  let cookieOtroPlantel: string;
  let contador = 0;

  // `null` means no session cookie (undefined would fall back to the Prácticas cookie).
  const pedir = (metodo: 'get' | 'post' | 'patch', ruta: string, body?: object, cookie: string | null = cookiePracticas) => {
    const req = request(app)[metodo](`/api/expedientes${ruta}`).set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    return body ? req.send(body) : req;
  };

  // A student with their own case file; the session is opened on demand (hashing is slow).
  async function caso({
    tipo = 'SERVICIO_SOCIAL',
    estado = 'PENDIENTE',
    semestre = 5,
    plantel = plantelId,
    datos = {},
  }: {
    tipo?: TipoPrograma;
    estado?: EstadoExpediente;
    semestre?: number;
    plantel?: string;
    datos?: Parameters<typeof crearExpediente>[0]['datos'];
  } = {}) {
    contador++;
    const matricula = `2531905199${String(contador).padStart(4, '0')}`;
    const usuario = await crearAlumnoPrecargado({ plantelId: plantel, matricula, password: PASSWORD_PRUEBA });
    const alumnoId = usuario.alumno!.id;
    if (semestre !== 5) await prisma.alumno.update({ where: { id: alumnoId }, data: { semestre } });
    const expediente = await crearExpediente({ alumnoId, tipo, estado, semestre, datos });
    return { usuario, alumnoId, expediente, id: expediente.id, cookie: () => iniciarSesion(app, usuario) };
  }
  const institucion = (datos: Parameters<typeof crearInstitucion>[0]['datos'] = {}, plantel = plantelId) =>
    crearInstitucion({ plantelId: plantel, datos });
  const supervisorDe = (institucionId: string, datos: Parameters<typeof crearSupervisor>[0]['datos'] = {}) =>
    crearSupervisor({ institucionId, datos });

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    const practicas = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' });
    vinculacionPracticasId = practicas.id;
    cookiePracticas = await iniciarSesion(app, practicas);
    cookieServicio = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
    cookieAdmin = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ADMIN' }));
    cookieOtroPlantel = await iniciarSesion(app, await crearUsuario({ plantelId: otroPlantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  describe('GET /api/expedientes/:id', () => {
    it('RF-10: the owner sees the case file with the student, institution and supervisor without private contact data', async () => {
      const inst = await crearInstitucion({ plantelId, nombre: 'Hospital Alfa' });
      const sup = await supervisorDe(inst.id, { nombre: 'Laura', telefono: '811', extension: '7' });
      const c = await caso({ tipo: 'PRACTICAS', datos: { supervisorId: sup.id, institucionId: inst.id, departamento: 'Sistemas', fechaInicio: new Date('2026-03-02') } });

      const res = await pedir('get', `/${c.id}`, undefined, await c.cookie());

      expect(res.status).toBe(200);
      expect(res.body.expediente).toMatchObject({
        id: c.id,
        tipo: 'PRACTICAS',
        estado: 'PENDIENTE',
        semestre: 5,
        metaHoras: 240,
        minutosTransferidos: 0,
        departamento: 'Sistemas',
        fechaInicio: '2026-03-02',
        fechaTermino: null,
        diasPactados: [],
        horaEntrada: null,
        horaSalida: null,
        programa: null,
        subprograma: null,
        institucion: { id: inst.id, nombre: 'Hospital Alfa' },
        supervisor: { id: sup.id, nombre: 'Laura', confirmado: true },
        alumno: { id: c.alumnoId, nombre: 'Ana María', apellidoPaterno: 'López', apellidoMaterno: 'García', matricula: c.usuario.username, semestre: 5 },
        faltantes: ['fechaTermino', 'diasPactados', 'horaEntrada', 'horaSalida'],
      });
      expect(res.body.expediente.supervisor).not.toHaveProperty('correo');
      expect(JSON.stringify(res.body)).not.toMatch(/correo|telefono|extension/);
    });

    it('RF-10: vinculación of the office sees the supervisor with all fields', async () => {
      const inst = await institucion();
      const sup = await supervisorDe(inst.id, { telefono: '811' });
      const c = await caso({ tipo: 'PRACTICAS', datos: { supervisorId: sup.id, institucionId: inst.id } });

      const res = await pedir('get', `/${c.id}`);

      expect(res.status).toBe(200);
      expect(res.body.expediente.supervisor).toMatchObject({ correo: sup.correo, telefono: '811' });
    });

    it('RF-10: a case file without institution or supervisor returns nulls', async () => {
      const c = await caso();

      const res = await pedir('get', `/${c.id}`, undefined, await c.cookie());

      expect(res.body.expediente).toMatchObject({ institucion: null, supervisor: null, faltantes: ['institucionId', 'supervisorId', 'fechaInicio'] });
    });

    it('RN-03b: ADMIN sees case files of both offices', async () => {
      const practicas = await caso({ tipo: 'PRACTICAS' });
      const servicio = await caso({ tipo: 'SERVICIO_SOCIAL' });

      expect((await pedir('get', `/${practicas.id}`, undefined, cookieAdmin)).status).toBe(200);
      expect((await pedir('get', `/${servicio.id}`, undefined, cookieAdmin)).status).toBe(200);
    });

    it('RN-03b: vinculación of the other office gets 403', async () => {
      const servicio = await caso({ tipo: 'SERVICIO_SOCIAL' });

      const res = await pedir('get', `/${servicio.id}`, undefined, cookiePracticas);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('RF-10: another student gets 403', async () => {
      const ajeno = await caso();
      const yo = await caso();

      expect((await pedir('get', `/${ajeno.id}`, undefined, await yo.cookie())).status).toBe(403);
    });

    it('404 for a case file of another plantel and for a missing one', async () => {
      const ajeno = await caso({ plantel: otroPlantelId });

      expect((await pedir('get', `/${ajeno.id}`)).status).toBe(404);
      expect((await pedir('get', `/${randomUUID()}`)).status).toBe(404);
    });

    it('400 for a non-uuid id', async () => {
      const res = await pedir('get', '/abc');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('401 without a session', async () => {
      expect((await pedir('get', `/${randomUUID()}`, undefined, null)).status).toBe(401);
    });
  });

  describe('GET /api/expedientes', () => {
    it('RN-03b: vinculación only lists the case files of its office', async () => {
      const practicas = await caso({ tipo: 'PRACTICAS' });
      const servicio = await caso({ tipo: 'SERVICIO_SOCIAL' });

      const ids = (res: request.Response) => res.body.expedientes.map((e: { id: string }) => e.id);
      const delPracticas = await pedir('get', '');
      const delServicio = await pedir('get', '', undefined, cookieServicio);

      expect(delPracticas.status).toBe(200);
      expect(ids(delPracticas)).toContain(practicas.id);
      expect(ids(delPracticas)).not.toContain(servicio.id);
      expect(ids(delServicio)).toContain(servicio.id);
      expect(ids(delServicio)).not.toContain(practicas.id);
    });

    it('RN-03b: ADMIN lists both offices, and only from its own plantel', async () => {
      const practicas = await caso({ tipo: 'PRACTICAS' });
      const servicio = await caso({ tipo: 'SERVICIO_SOCIAL' });
      const ajeno = await caso({ tipo: 'PRACTICAS', plantel: otroPlantelId });

      const res = await pedir('get', '', undefined, cookieAdmin);

      const ids = res.body.expedientes.map((e: { id: string }) => e.id);
      expect(ids).toContain(practicas.id);
      expect(ids).toContain(servicio.id);
      expect(ids).not.toContain(ajeno.id);
    });

    it('RF-10: filters by estado and each row carries what the office needs to confirm', async () => {
      const inst = await institucion();
      const sup = await supervisorDe(inst.id, { confirmado: false });
      const pendiente = await caso({ tipo: 'PRACTICAS', estado: 'PENDIENTE', datos: { institucionId: inst.id, supervisorId: sup.id } });
      const enProceso = await caso({ tipo: 'PRACTICAS', estado: 'EN_PROCESO' });

      const res = await pedir('get', '?estado=PENDIENTE');

      expect(res.status).toBe(200);
      const ids = res.body.expedientes.map((e: { id: string }) => e.id);
      expect(ids).toContain(pendiente.id);
      expect(ids).not.toContain(enProceso.id);
      expect(res.body.expedientes.every((e: { estado: string }) => e.estado === 'PENDIENTE')).toBe(true);
      const fila = res.body.expedientes.find((e: { id: string }) => e.id === pendiente.id);
      expect(fila).toMatchObject({
        alumno: { nombre: 'Ana María', apellidoPaterno: 'López', matricula: pendiente.usuario.username },
        institucion: { id: inst.id },
        supervisor: { id: sup.id, confirmado: false, correo: sup.correo },
      });
    });

    it('400 for an unknown estado', async () => {
      const res = await pedir('get', '?estado=OTRO');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('401 without a session', async () => {
      expect((await pedir('get', '', undefined, null)).status).toBe(401);
    });

    it('403 for ALUMNO', async () => {
      const c = await caso();

      expect((await pedir('get', '', undefined, await c.cookie())).status).toBe(403);
    });
  });

  describe('PATCH /api/expedientes/:id', () => {
    it('RF-10: the owner completes a servicio social case file while it is PENDIENTE', async () => {
      const inst = await institucion();
      const sup = await supervisorDe(inst.id, { confirmado: false });
      const c = await caso();

      const res = await pedir(
        'patch',
        `/${c.id}`,
        { institucionId: inst.id, supervisorId: sup.id, departamento: ' Recursos Humanos ', fechaInicio: '2026-03-02', programa: 'Salud', subprograma: 'Prevención' },
        await c.cookie(),
      );

      expect(res.status).toBe(200);
      expect(res.body.expediente).toMatchObject({
        id: c.id,
        estado: 'PENDIENTE',
        institucion: { id: inst.id },
        supervisor: { id: sup.id, confirmado: false },
        departamento: 'Recursos Humanos',
        fechaInicio: '2026-03-02',
        programa: 'Salud',
        subprograma: 'Prevención',
        faltantes: [],
      });
      const fila = await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } });
      expect(fila).toMatchObject({ institucionId: inst.id, supervisorId: sup.id, estado: 'PENDIENTE' });
      expect(fila.fechaInicio?.toISOString()).toBe('2026-03-02T00:00:00.000Z');
    });

    it('RF-10: prácticas also takes end date and schedule (days sorted and deduplicated)', async () => {
      const inst = await institucion();
      const c = await caso({ tipo: 'PRACTICAS' });

      const res = await pedir(
        'patch',
        `/${c.id}`,
        { institucionId: inst.id, fechaInicio: '2026-03-02', fechaTermino: '2026-06-01', diasPactados: [5, 1, 3, 1], horaEntrada: '08:00', horaSalida: '12:30' },
        await c.cookie(),
      );

      expect(res.status).toBe(200);
      expect(res.body.expediente).toMatchObject({ fechaTermino: '2026-06-01', diasPactados: [1, 3, 5], horaEntrada: '08:00', horaSalida: '12:30' });
    });

    it('RF-10: fechaInicio accepts any date, past or future', async () => {
      const c = await caso();
      const cookie = await c.cookie();

      const pasada = await pedir('patch', `/${c.id}`, { fechaInicio: '2020-01-15' }, cookie);
      const futura = await pedir('patch', `/${c.id}`, { fechaInicio: '2031-12-31' }, cookie);

      expect(pasada.status).toBe(200);
      expect(futura.body.expediente.fechaInicio).toBe('2031-12-31');
    });

    it('RF-10: a partial update leaves the other fields as they were', async () => {
      const c = await caso({ datos: { departamento: 'Contabilidad', programa: 'Educación' } });

      const res = await pedir('patch', `/${c.id}`, { subprograma: 'Lectura' }, await c.cookie());

      expect(res.body.expediente).toMatchObject({ departamento: 'Contabilidad', programa: 'Educación', subprograma: 'Lectura' });
    });

    it('RF-10: optional fields can be cleared with null', async () => {
      const c = await caso({ datos: { departamento: 'Contabilidad' } });

      const res = await pedir('patch', `/${c.id}`, { departamento: null }, await c.cookie());

      expect(res.body.expediente.departamento).toBeNull();
    });

    it('RF-10: vinculación of the office edits while PENDIENTE, EN_PROCESO or SUSPENDIDO', async () => {
      for (const estado of ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'] as const) {
        const c = await caso({ tipo: 'PRACTICAS', estado });

        const res = await pedir('patch', `/${c.id}`, { departamento: `Área ${estado}` });

        expect(res.status).toBe(200);
        expect(res.body.expediente.departamento).toBe(`Área ${estado}`);
      }
    });

    it('RF-10: ADMIN can edit', async () => {
      const c = await caso({ tipo: 'PRACTICAS' });

      expect((await pedir('patch', `/${c.id}`, { departamento: 'X' }, cookieAdmin)).status).toBe(200);
    });

    it('RF-10: the student cannot edit once the case file is no longer PENDIENTE (409 EXPEDIENTE_NO_EDITABLE)', async () => {
      const c = await caso({ estado: 'EN_PROCESO' });

      const res = await pedir('patch', `/${c.id}`, { departamento: 'X' }, await c.cookie());

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EXPEDIENTE_NO_EDITABLE');
    });

    it.each(['FINALIZADO', 'CANCELADO'] as const)('RF-11: nobody edits a %s case file (409)', async (estado) => {
      const c = await caso({ tipo: 'PRACTICAS', estado });

      const res = await pedir('patch', `/${c.id}`, { departamento: 'X' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EXPEDIENTE_NO_EDITABLE');
    });

    it('RN-01: a student below 5th semester cannot complete the case file (409)', async () => {
      const inst = await institucion();
      const c = await caso({ semestre: 4 });

      const res = await pedir('patch', `/${c.id}`, { institucionId: inst.id }, await c.cookie());

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SEMESTRE_INSUFICIENTE');
    });

    it('RN-01: the student record is checked too, not only the case file', async () => {
      const c = await caso({ tipo: 'PRACTICAS' });
      await prisma.alumno.update({ where: { id: c.alumnoId }, data: { semestre: 3 } });

      const res = await pedir('patch', `/${c.id}`, { departamento: 'X' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SEMESTRE_INSUFICIENTE');
    });

    it('RF-10: an inactive institution is rejected (400 INSTITUCION_INVALIDA)', async () => {
      const inst = await institucion({ activa: false });
      const c = await caso();

      const res = await pedir('patch', `/${c.id}`, { institucionId: inst.id }, await c.cookie());

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSTITUCION_INVALIDA');
    });

    it('RF-10: an institution of another plantel or a missing one is rejected (400 INSTITUCION_INVALIDA)', async () => {
      const ajena = await institucion({}, otroPlantelId);
      const c = await caso();
      const cookie = await c.cookie();

      expect((await pedir('patch', `/${c.id}`, { institucionId: ajena.id }, cookie)).body.error.code).toBe('INSTITUCION_INVALIDA');
      expect((await pedir('patch', `/${c.id}`, { institucionId: randomUUID() }, cookie)).body.error.code).toBe('INSTITUCION_INVALIDA');
    });

    it('RF-10: the institution must accept the program type (400 INSTITUCION_NO_ACEPTA_TIPO)', async () => {
      const soloServicio = await institucion({ aceptaPracticas: false });
      const soloPracticas = await institucion({ aceptaServicio: false });
      const practicas = await caso({ tipo: 'PRACTICAS' });
      const servicio = await caso({ tipo: 'SERVICIO_SOCIAL' });

      const a = await pedir('patch', `/${practicas.id}`, { institucionId: soloServicio.id });
      const b = await pedir('patch', `/${servicio.id}`, { institucionId: soloPracticas.id }, cookieServicio);

      expect(a.status).toBe(400);
      expect(a.body.error.code).toBe('INSTITUCION_NO_ACEPTA_TIPO');
      expect(b.body.error.code).toBe('INSTITUCION_NO_ACEPTA_TIPO');
    });

    it('RF-10: the supervisor must belong to the institution (400 SUPERVISOR_DE_OTRA_INSTITUCION)', async () => {
      const inst = await institucion();
      const otra = await institucion();
      const deOtra = await supervisorDe(otra.id);
      const c = await caso({ datos: { institucionId: inst.id } });

      const res = await pedir('patch', `/${c.id}`, { supervisorId: deOtra.id }, await c.cookie());

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SUPERVISOR_DE_OTRA_INSTITUCION');
    });

    it('RF-10: a supervisor needs the institution to be chosen first', async () => {
      const inst = await institucion();
      const sup = await supervisorDe(inst.id);
      const c = await caso({ tipo: 'PRACTICAS' });

      const res = await pedir('patch', `/${c.id}`, { supervisorId: sup.id });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SUPERVISOR_DE_OTRA_INSTITUCION');
    });

    it('RF-10: a missing supervisor is rejected (400 SUPERVISOR_INVALIDO)', async () => {
      const inst = await institucion();
      const c = await caso({ tipo: 'PRACTICAS', datos: { institucionId: inst.id } });

      const res = await pedir('patch', `/${c.id}`, { supervisorId: randomUUID() });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SUPERVISOR_INVALIDO');
    });

    it('RF-10: changing the institution while keeping a supervisor of the old one is an error', async () => {
      const vieja = await institucion();
      const nueva = await institucion();
      const sup = await supervisorDe(vieja.id);
      const c = await caso({ tipo: 'PRACTICAS', datos: { institucionId: vieja.id, supervisorId: sup.id } });

      const res = await pedir('patch', `/${c.id}`, { institucionId: nueva.id });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SUPERVISOR_DE_OTRA_INSTITUCION');
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).institucionId).toBe(vieja.id);
    });

    it('RF-10: changing the institution together with a new supervisor (or clearing it) works', async () => {
      const vieja = await institucion();
      const nueva = await institucion();
      const supVieja = await supervisorDe(vieja.id);
      const supNueva = await supervisorDe(nueva.id);
      const c = await caso({ tipo: 'PRACTICAS', datos: { institucionId: vieja.id, supervisorId: supVieja.id } });

      const conNuevo = await pedir('patch', `/${c.id}`, { institucionId: nueva.id, supervisorId: supNueva.id });
      const limpiando = await pedir('patch', `/${c.id}`, { institucionId: vieja.id, supervisorId: null });

      expect(conNuevo.status).toBe(200);
      expect(conNuevo.body.expediente).toMatchObject({ institucion: { id: nueva.id }, supervisor: { id: supNueva.id } });
      expect(limpiando.status).toBe(200);
      expect(limpiando.body.expediente).toMatchObject({ institucion: { id: vieja.id }, supervisor: null });
    });

    it('RN-06: the end date must be after the start date (400 PERIODO_INVALIDO), also against the stored start', async () => {
      const c = await caso({ tipo: 'PRACTICAS', datos: { fechaInicio: new Date('2026-03-02') } });

      const igual = await pedir('patch', `/${c.id}`, { fechaTermino: '2026-03-02' });
      const anterior = await pedir('patch', `/${c.id}`, { fechaInicio: '2026-03-01', fechaTermino: '2026-02-01' });

      expect(igual.status).toBe(400);
      expect(igual.body.error.code).toBe('PERIODO_INVALIDO');
      expect(anterior.body.error.code).toBe('PERIODO_INVALIDO');
    });

    it('RN-06: moving the start date past the stored end date is rejected', async () => {
      const c = await caso({ tipo: 'PRACTICAS', datos: { fechaInicio: new Date('2026-03-02'), fechaTermino: new Date('2026-06-01') } });

      const res = await pedir('patch', `/${c.id}`, { fechaInicio: '2026-07-01' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PERIODO_INVALIDO');
    });

    it('RN-06b: entry must be before exit (400 HORARIO_INVALIDO), also against the stored time', async () => {
      const c = await caso({ tipo: 'PRACTICAS', datos: { horaSalida: '12:00' } });

      const ambas = await pedir('patch', `/${c.id}`, { horaEntrada: '13:00', horaSalida: '09:00' });
      const contraGuardada = await pedir('patch', `/${c.id}`, { horaEntrada: '12:00' });

      expect(ambas.status).toBe(400);
      expect(ambas.body.error.code).toBe('HORARIO_INVALIDO');
      expect(contraGuardada.body.error.code).toBe('HORARIO_INVALIDO');
    });

    it.each([
      ['day 0', { diasPactados: [0] }],
      ['day 8', { diasPactados: [8] }],
      ['empty days', { diasPactados: [] }],
      ['fractional day', { diasPactados: [1.5] }],
      ['bad time format', { horaEntrada: '8:00' }],
      ['impossible time', { horaSalida: '25:00' }],
      ['bad date', { fechaInicio: '2026-02-30' }],
      ['date with time', { fechaInicio: '2026-02-01T10:00:00Z' }],
      ['non-uuid institution', { institucionId: 'abc' }],
      ['null institution', { institucionId: null }],
      ['null start date', { fechaInicio: null }],
      ['empty body', {}],
    ])('RN-06: 400 for %s', async (_caso, body) => {
      const c = await caso({ tipo: 'PRACTICAS' });

      const res = await pedir('patch', `/${c.id}`, body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('RF-10: fields that do not apply to servicio social are rejected (400 CAMPOS_NO_APLICABLES)', async () => {
      const c = await caso({ tipo: 'SERVICIO_SOCIAL' });

      const res = await pedir('patch', `/${c.id}`, { fechaTermino: '2026-06-01', horaEntrada: '08:00', departamento: 'X' }, await c.cookie());

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CAMPOS_NO_APLICABLES');
      expect(res.body.error.details).toEqual({ campos: ['fechaTermino', 'horaEntrada'] });
    });

    it('RF-10: programa and subprograma do not apply to prácticas (400 CAMPOS_NO_APLICABLES)', async () => {
      const c = await caso({ tipo: 'PRACTICAS' });

      const res = await pedir('patch', `/${c.id}`, { programa: 'Salud' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CAMPOS_NO_APLICABLES');
      expect(res.body.error.details).toEqual({ campos: ['programa'] });
    });

    it.each([
      ['tipo', { tipo: 'PRACTICAS' }],
      ['estado', { estado: 'EN_PROCESO' }],
      ['metaHoras', { metaHoras: 1 }],
      ['minutosTransferidos', { minutosTransferidos: 600 }],
    ])('RN-02: %s cannot be changed through PATCH (400)', async (_campo, body) => {
      const c = await caso();

      const res = await pedir('patch', `/${c.id}`, { departamento: 'X', ...body });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const fila = await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } });
      expect(fila).toMatchObject({ tipo: 'SERVICIO_SOCIAL', estado: 'PENDIENTE', metaHoras: 480, minutosTransferidos: 0, departamento: null });
    });

    it('RF-29: audits EDITAR_EXPEDIENTE with previous and new values of what changed', async () => {
      const c = await caso({ tipo: 'PRACTICAS', datos: { departamento: 'Antes' } });

      await pedir('patch', `/${c.id}`, { departamento: 'Después', fechaInicio: '2026-03-02' });

      const logs = await prisma.auditLog.findMany({ where: { entidadId: c.id } });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        usuarioId: vinculacionPracticasId,
        accion: 'EDITAR_EXPEDIENTE',
        entidad: 'Expediente',
        antes: { departamento: 'Antes', fechaInicio: null },
        despues: { departamento: 'Después', fechaInicio: '2026-03-02' },
      });
    });

    it('RF-29: no audit entry when nothing changed', async () => {
      const c = await caso({ datos: { departamento: 'Igual' } });

      const res = await pedir('patch', `/${c.id}`, { departamento: 'Igual' }, await c.cookie());

      expect(res.status).toBe(200);
      expect(await prisma.auditLog.count({ where: { entidadId: c.id } })).toBe(0);
    });

    it('RN-03b: vinculación of the other office gets 403 and nothing changes', async () => {
      const c = await caso({ tipo: 'SERVICIO_SOCIAL' });

      const res = await pedir('patch', `/${c.id}`, { departamento: 'X' }, cookiePracticas);

      expect(res.status).toBe(403);
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).departamento).toBeNull();
    });

    it('RF-10: another student gets 403', async () => {
      const ajeno = await caso();
      const yo = await caso();

      const res = await pedir('patch', `/${ajeno.id}`, { departamento: 'X' }, await yo.cookie());

      expect(res.status).toBe(403);
    });

    it('404 for a case file of another plantel and for a missing one', async () => {
      const ajeno = await caso({ tipo: 'PRACTICAS', plantel: otroPlantelId });

      expect((await pedir('patch', `/${ajeno.id}`, { departamento: 'X' })).status).toBe(404);
      expect((await pedir('patch', `/${randomUUID()}`, { departamento: 'X' })).status).toBe(404);
    });

    it('400 for a non-uuid id', async () => {
      expect((await pedir('patch', '/abc', { departamento: 'X' })).status).toBe(400);
    });

    it('401 without a session', async () => {
      expect((await pedir('patch', `/${randomUUID()}`, { departamento: 'X' }, null)).status).toBe(401);
    });
  });

  describe('POST /api/expedientes/:id/confirmar', () => {
    const completoServicio = async () => {
      const inst = await institucion();
      const sup = await supervisorDe(inst.id, { confirmado: false });
      const c = await caso({ tipo: 'SERVICIO_SOCIAL', datos: { institucionId: inst.id, supervisorId: sup.id, fechaInicio: new Date('2026-03-02') } });
      return { ...c, supervisorId: sup.id };
    };

    it('RF-10: confirming moves the case file to EN_PROCESO and confirms the supervisor in the same action', async () => {
      const c = await completoServicio();

      const res = await pedir('post', `/${c.id}/confirmar`, undefined, cookieServicio);

      expect(res.status).toBe(200);
      expect(res.body.expediente).toMatchObject({ id: c.id, estado: 'EN_PROCESO', supervisor: { id: c.supervisorId, confirmado: true }, faltantes: [] });
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe('EN_PROCESO');
      expect((await prisma.supervisor.findUniqueOrThrow({ where: { id: c.supervisorId } })).confirmado).toBe(true);
    });

    it('RF-10: prácticas with period and schedule can be confirmed', async () => {
      const inst = await institucion();
      const sup = await supervisorDe(inst.id, { confirmado: false });
      const c = await caso({
        tipo: 'PRACTICAS',
        datos: {
          institucionId: inst.id,
          supervisorId: sup.id,
          fechaInicio: new Date('2026-03-02'),
          fechaTermino: new Date('2026-06-01'),
          diasPactados: [1, 2, 3],
          horaEntrada: '08:00',
          horaSalida: '12:00',
        },
      });

      const res = await pedir('post', `/${c.id}/confirmar`);

      expect(res.status).toBe(200);
      expect(res.body.expediente.estado).toBe('EN_PROCESO');
    });

    it('RF-10: ADMIN can confirm either office', async () => {
      const c = await completoServicio();

      expect((await pedir('post', `/${c.id}/confirmar`, undefined, cookieAdmin)).status).toBe(200);
    });

    it('RF-29: audits CONFIRMAR_EXPEDIENTE with the state change and the supervisor confirmation', async () => {
      const c = await completoServicio();

      await pedir('post', `/${c.id}/confirmar`, undefined, cookieServicio);

      const logs = await prisma.auditLog.findMany({ where: { entidadId: c.id } });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        accion: 'CONFIRMAR_EXPEDIENTE',
        entidad: 'Expediente',
        antes: { estado: 'PENDIENTE', supervisorConfirmado: false },
        despues: { estado: 'EN_PROCESO', supervisorConfirmado: true, supervisorId: c.supervisorId },
      });
      expect(logs[0]?.usuarioId).toBeTruthy();
    });

    it('RF-10: a supervisor that was already confirmed stays confirmed', async () => {
      const inst = await institucion();
      const sup = await supervisorDe(inst.id);
      const c = await caso({ datos: { institucionId: inst.id, supervisorId: sup.id, fechaInicio: new Date('2026-03-02') } });

      const res = await pedir('post', `/${c.id}/confirmar`, undefined, cookieServicio);

      expect(res.status).toBe(200);
      expect(res.body.expediente.supervisor.confirmado).toBe(true);
    });

    it('RF-10: missing data responds 409 EXPEDIENTE_INCOMPLETO listing the missing fields and changes nothing', async () => {
      const inst = await institucion();
      const sup = await supervisorDe(inst.id, { confirmado: false });
      const c = await caso({ tipo: 'PRACTICAS', datos: { institucionId: inst.id, supervisorId: sup.id } });

      const res = await pedir('post', `/${c.id}/confirmar`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EXPEDIENTE_INCOMPLETO');
      expect(res.body.error.details).toEqual({ faltantes: ['fechaInicio', 'fechaTermino', 'diasPactados', 'horaEntrada', 'horaSalida'] });
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe('PENDIENTE');
      expect((await prisma.supervisor.findUniqueOrThrow({ where: { id: sup.id } })).confirmado).toBe(false);
      expect(await prisma.auditLog.count({ where: { entidadId: c.id } })).toBe(0);
    });

    it('RF-11: only a PENDIENTE case file can be confirmed (409 EXPEDIENTE_NO_PENDIENTE)', async () => {
      const c = await caso({ estado: 'EN_PROCESO' });

      const res = await pedir('post', `/${c.id}/confirmar`, undefined, cookieServicio);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EXPEDIENTE_NO_PENDIENTE');
    });

    it('RF-11: confirming twice fails the second time and audits once', async () => {
      const c = await completoServicio();
      await pedir('post', `/${c.id}/confirmar`, undefined, cookieServicio);

      const segunda = await pedir('post', `/${c.id}/confirmar`, undefined, cookieServicio);

      expect(segunda.status).toBe(409);
      expect(await prisma.auditLog.count({ where: { entidadId: c.id, accion: 'CONFIRMAR_EXPEDIENTE' } })).toBe(1);
    });

    it('RN-01: a student below 5th semester cannot be confirmed (409 SEMESTRE_INSUFICIENTE)', async () => {
      const inst = await institucion();
      const sup = await supervisorDe(inst.id);
      const c = await caso({ semestre: 4, datos: { institucionId: inst.id, supervisorId: sup.id, fechaInicio: new Date('2026-03-02') } });

      const res = await pedir('post', `/${c.id}/confirmar`, undefined, cookieServicio);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SEMESTRE_INSUFICIENTE');
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe('PENDIENTE');
    });

    it('RN-03: the database never allows a second active case file for the same student', async () => {
      const c = await caso({ tipo: 'SERVICIO_SOCIAL', estado: 'EN_PROCESO' });

      await expect(crearExpediente({ alumnoId: c.alumnoId, tipo: 'PRACTICAS', estado: 'PENDIENTE' })).rejects.toThrow();
    });

    it('RN-03: a student with a finished case file can still confirm a new one', async () => {
      const c = await completoServicio();
      await crearExpediente({ alumnoId: c.alumnoId, tipo: 'PRACTICAS', estado: 'FINALIZADO' });

      expect((await pedir('post', `/${c.id}/confirmar`, undefined, cookieServicio)).status).toBe(200);
    });

    it('RN-03b: vinculación of the other office gets 403 and nothing changes', async () => {
      const c = await completoServicio();

      const res = await pedir('post', `/${c.id}/confirmar`, undefined, cookiePracticas);

      expect(res.status).toBe(403);
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe('PENDIENTE');
    });

    it('403 for ALUMNO, even for their own case file', async () => {
      const c = await completoServicio();

      const res = await pedir('post', `/${c.id}/confirmar`, undefined, await c.cookie());

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('404 for a case file of another plantel and for a missing one', async () => {
      const ajeno = await caso({ tipo: 'PRACTICAS', plantel: otroPlantelId });

      expect((await pedir('post', `/${ajeno.id}/confirmar`)).status).toBe(404);
      expect((await pedir('post', `/${randomUUID()}/confirmar`)).status).toBe(404);
      expect((await pedir('post', `/${randomUUID()}/confirmar`, undefined, cookieOtroPlantel)).status).toBe(404);
    });

    it('400 for a non-uuid id', async () => {
      expect((await pedir('post', '/abc/confirmar')).status).toBe(400);
    });

    it('401 without a session', async () => {
      expect((await pedir('post', `/${randomUUID()}/confirmar`, undefined, null)).status).toBe(401);
    });
  });
});
