import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarPlantel, crearCarreraPrueba, crearInstitucion, crearPlantel, crearUsuario, iniciarSesion } from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { hashTokenQr } from '../../domain/qrInstitucion.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { crearInstitucionSchema } from './instituciones.schemas.js';
import { crearInstitucion as crearInstitucionServicio } from './instituciones.service.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

describe('/api/instituciones', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let vinculacionId: string;
  let cookieVinculacion: string;
  let cookieAdmin: string;
  let cookieAlumno: string;
  let carreraA: { id: string; nombre: string };
  let carreraB: { id: string; nombre: string };

  // `null` means no session cookie (undefined would fall back to the vinculación cookie).
  const pedir = (metodo: 'get' | 'post' | 'patch', ruta: string, body?: object, cookie: string | null = cookieVinculacion) => {
    const req = request(app)[metodo](`/api/instituciones${ruta}`).set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    return body ? req.send(body) : req;
  };
  const altaMinima = (extra: object = {}) => ({ nombre: `Empresa ${randomUUID()}`, calle: 'Av. Juárez 123', municipio: 'Guadalupe', ...extra });

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    const vinculacion = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' });
    vinculacionId = vinculacion.id;
    cookieVinculacion = await iniciarSesion(app, vinculacion);
    cookieAdmin = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ADMIN' }));
    cookieAlumno = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ALUMNO' }));
    carreraA = await crearCarreraPrueba('Programación');
    carreraB = await crearCarreraPrueba('Contabilidad');
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  describe('POST /api/instituciones (RF-08)', () => {
    it('RF-08: creates an institution with defaults, carreras and no QR secrets in the response', async () => {
      const res = await pedir(
        'post',
        '',
        altaMinima({ nombre: 'Hospital Alfa', rfc: ' abc010101xx1 ', carreraIds: [carreraA.id], turnos: ['MATUTINO'], cupo: 5 }),
      );

      expect(res.status).toBe(201);
      expect(res.body.institucion).toMatchObject({
        id: expect.any(String),
        nombre: 'Hospital Alfa',
        rfc: 'ABC010101XX1',
        estado: 'Nuevo León',
        turnos: ['MATUTINO'],
        aceptaServicio: true,
        aceptaPracticas: true,
        cupo: 5,
        activa: true,
        codigoCorto: expect.stringMatching(/^[A-Z2-9]{6}$/),
        carreras: [{ id: carreraA.id, nombre: carreraA.nombre }],
      });
      expect(JSON.stringify(res.body)).not.toMatch(/qrToken|token/i);

      const fila = await prisma.institucion.findUniqueOrThrow({ where: { id: res.body.institucion.id } });
      expect(fila.plantelId).toBe(plantelId);
      expect(fila.qrTokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('RNF-06: the stored hash is never returned (the raw token is unrecoverable)', async () => {
      const res = await pedir('post', '', altaMinima());
      const fila = await prisma.institucion.findUniqueOrThrow({ where: { id: res.body.institucion.id } });

      expect(JSON.stringify(res.body)).not.toContain(fila.qrTokenHash);
    });

    it('RF-08: ADMIN can also create', async () => {
      const res = await pedir('post', '', altaMinima(), cookieAdmin);

      expect(res.status).toBe(201);
    });

    it('RF-29: records who created it, with the new values and without the hash', async () => {
      const res = await pedir('post', '', altaMinima({ nombre: 'Auditada SA', cupo: 3 }));

      const logs = await prisma.auditLog.findMany({ where: { entidadId: res.body.institucion.id } });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ usuarioId: vinculacionId, accion: 'CREAR_INSTITUCION', entidad: 'Institucion', antes: null });
      expect(logs[0]?.despues).toMatchObject({ nombre: 'Auditada SA', cupo: 3, plantelId });
      expect(JSON.stringify(logs[0])).not.toMatch(/qrTokenHash|[0-9a-f]{64}/);
    });

    it('RF-08: the same RFC in the same plantel responds 409', async () => {
      const rfc = 'DUP010101AB1';
      await pedir('post', '', altaMinima({ rfc }));

      const res = await pedir('post', '', altaMinima({ rfc: rfc.toLowerCase() }));

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RFC_DUPLICADO');
    });

    it('RF-08: the same RFC in another plantel is allowed', async () => {
      await crearInstitucion({ plantelId: otroPlantelId, datos: { rfc: 'OTR010101AB1' } });

      const res = await pedir('post', '', altaMinima({ rfc: 'OTR010101AB1' }));

      expect(res.status).toBe(201);
    });

    it('RF-08: unknown carreras respond 400', async () => {
      const res = await pedir('post', '', altaMinima({ carreraIds: [randomUUID()] }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CARRERAS_INVALIDAS');
    });

    it.each([
      ['missing nombre', { calle: 'x', municipio: 'x' }],
      ['empty nombre', { nombre: '  ', calle: 'x', municipio: 'x' }],
      ['missing calle', { nombre: 'x', municipio: 'x' }],
      ['missing municipio', { nombre: 'x', calle: 'x' }],
      ['negative cupo', { nombre: 'x', calle: 'x', municipio: 'x', cupo: -1 }],
      ['fractional cupo', { nombre: 'x', calle: 'x', municipio: 'x', cupo: 1.5 }],
      ['unknown turno', { nombre: 'x', calle: 'x', municipio: 'x', turnos: ['NOCTURNO'] }],
      ['invalid correo', { nombre: 'x', calle: 'x', municipio: 'x', correo: 'no-es-correo' }],
      ['non-uuid carrera', { nombre: 'x', calle: 'x', municipio: 'x', carreraIds: ['abc'] }],
    ])('400 for %s', async (_caso, body) => {
      const res = await pedir('post', '', body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('401 without a session', async () => {
      expect((await pedir('post', '', altaMinima(), null)).status).toBe(401);
    });

    it('403 for ALUMNO', async () => {
      const res = await pedir('post', '', altaMinima(), cookieAlumno);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('QR credential collisions (RNF-06, RF-15)', () => {
    const usuario = () => ({ id: vinculacionId, plantelId }) as AuthUser;
    const entrada = () => crearInstitucionSchema.parse(altaMinima());

    it('RF-15: retries with fresh credentials when the codigoCorto already exists', async () => {
      const existente = await crearInstitucion({ plantelId, datos: { codigoCorto: 'COLIS1' } });
      let llamadas = 0;
      const generar = () =>
        ++llamadas === 1
          ? { token: 't1', qrTokenHash: hashTokenQr('t1-unico'), codigoCorto: existente.codigoCorto }
          : { token: 't2', qrTokenHash: hashTokenQr('t2-unico'), codigoCorto: 'FRESC2' };

      const creada = await crearInstitucionServicio(usuario(), entrada(), generar);

      expect(llamadas).toBe(2);
      expect(creada.codigoCorto).toBe('FRESC2');
    });

    it('RNF-06: retries when the qrTokenHash already exists', async () => {
      const hash = hashTokenQr('repetido');
      await crearInstitucion({ plantelId, datos: { qrTokenHash: hash } });
      let llamadas = 0;
      const generar = () => ({ token: 't', qrTokenHash: ++llamadas === 1 ? hash : hashTokenQr('otro'), codigoCorto: `Z${llamadas}AAAA` });

      const creada = await crearInstitucionServicio(usuario(), entrada(), generar);

      expect(llamadas).toBe(2);
      expect(creada.id).toEqual(expect.any(String));
    });

    it('RNF-06: gives up after repeated collisions instead of looping forever', async () => {
      const existente = await crearInstitucion({ plantelId, datos: { codigoCorto: 'SIEMPR' } });
      const generar = () => ({ token: 't', qrTokenHash: hashTokenQr(randomUUID()), codigoCorto: existente.codigoCorto });

      await expect(crearInstitucionServicio(usuario(), entrada(), generar)).rejects.toThrow();
    });
  });

  describe('GET /api/instituciones/:id (RF-05)', () => {
    it('RF-05: returns the full record for vinculación, with codigoCorto and carreras', async () => {
      const inst = await crearInstitucion({ plantelId, nombre: 'Ficha SA', datos: { rfc: 'FIC010101AB1', giro: 'Salud' }, carreraIds: [carreraB.id] });

      const res = await pedir('get', `/${inst.id}`);

      expect(res.status).toBe(200);
      expect(res.body.institucion).toMatchObject({
        id: inst.id,
        nombre: 'Ficha SA',
        rfc: 'FIC010101AB1',
        giro: 'Salud',
        codigoCorto: inst.codigoCorto,
        carreras: [{ id: carreraB.id, nombre: carreraB.nombre }],
      });
      expect(res.body.institucion).not.toHaveProperty('qrTokenHash');
      expect(JSON.stringify(res.body)).not.toContain(inst.qrTokenHash);
    });

    it('RF-05: ADMIN can read', async () => {
      const inst = await crearInstitucion({ plantelId });

      expect((await pedir('get', `/${inst.id}`, undefined, cookieAdmin)).status).toBe(200);
    });

    it('RF-05: ALUMNO can read an active institution, without codigoCorto', async () => {
      const inst = await crearInstitucion({ plantelId });

      const res = await pedir('get', `/${inst.id}`, undefined, cookieAlumno);

      expect(res.status).toBe(200);
      expect(res.body.institucion).not.toHaveProperty('codigoCorto');
      expect(res.body.institucion).not.toHaveProperty('qrTokenHash');
    });

    it('RF-05: ALUMNO gets 404 for an inactive institution, vinculación still sees it', async () => {
      const inst = await crearInstitucion({ plantelId, datos: { activa: false } });

      expect((await pedir('get', `/${inst.id}`, undefined, cookieAlumno)).status).toBe(404);
      expect((await pedir('get', `/${inst.id}`)).status).toBe(200);
    });

    it('RN-03b: 404 for an institution of another plantel', async () => {
      const inst = await crearInstitucion({ plantelId: otroPlantelId });

      expect((await pedir('get', `/${inst.id}`)).status).toBe(404);
    });

    it('400 for an invalid id', async () => {
      const res = await pedir('get', '/no-es-uuid');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('401 without a session', async () => {
      expect((await pedir('get', `/${randomUUID()}`, undefined, null)).status).toBe(401);
    });
  });

  describe('GET /api/instituciones (RF-06)', () => {
    let plantelFiltros: string;
    let cookieFiltros: string;
    let cookieAlumnoFiltros: string;
    const listar = async (query: string, cookie = cookieFiltros) => {
      const res = await request(app).get(`/api/instituciones${query}`).set('Cookie', cookie);
      return { res, nombres: (res.body.instituciones ?? []).map((i: { nombre: string }) => i.nombre) as string[] };
    };

    beforeAll(async () => {
      plantelFiltros = (await crearPlantel()).id;
      cookieFiltros = await iniciarSesion(app, await crearUsuario({ plantelId: plantelFiltros, rol: 'VINCULACION' }));
      cookieAlumnoFiltros = await iniciarSesion(app, await crearUsuario({ plantelId: plantelFiltros, rol: 'ALUMNO' }));
      const p = plantelFiltros;
      await crearInstitucion({
        plantelId: p,
        nombre: 'Clínica Ñandú',
        datos: { giro: 'Salud', municipio: 'Monterrey', colonia: 'Centro', turnos: ['MATUTINO'], cupo: 4, aceptaServicio: true, aceptaPracticas: false },
        carreraIds: [carreraA.id],
      });
      await crearInstitucion({
        plantelId: p,
        nombre: 'Taller Beta',
        datos: { giro: 'Mecánica automotriz', municipio: 'San Nicolás', colonia: 'Anáhuac', turnos: ['VESPERTINO'], cupo: 0, aceptaServicio: false, aceptaPracticas: true },
        carreraIds: [carreraB.id],
      });
      await crearInstitucion({
        plantelId: p,
        nombre: 'Oficina Gamma',
        datos: { giro: 'Contabilidad', municipio: 'Monterrey', colonia: 'Obrera', turnos: ['MATUTINO', 'VESPERTINO'], cupo: null },
      });
      await crearInstitucion({ plantelId: p, nombre: 'Inactiva Delta', datos: { municipio: 'Monterrey', activa: false, cupo: 9 } });
      await crearInstitucion({ plantelId: otroPlantelId, nombre: 'De Otro Plantel' });
    });

    afterAll(async () => {
      await borrarPlantel(plantelFiltros);
    });

    it('RF-06: lists the plantel catalog sorted by name, without other plantels and without qrTokenHash', async () => {
      const { res, nombres } = await listar('');

      expect(res.status).toBe(200);
      expect(nombres).toEqual(['Clínica Ñandú', 'Inactiva Delta', 'Oficina Gamma', 'Taller Beta']);
      expect(JSON.stringify(res.body)).not.toMatch(/qrToken|De Otro Plantel/);
    });

    it('RF-06: q matches nombre or giro, ignoring case and accents', async () => {
      expect((await listar('?q=clinica nandu')).nombres).toEqual(['Clínica Ñandú']);
      expect((await listar('?q=MECANICA')).nombres).toEqual(['Taller Beta']);
    });

    it('RF-06: municipio and colonia filter ignoring case and accents', async () => {
      expect((await listar('?municipio=san nicolas')).nombres).toEqual(['Taller Beta']);
      expect((await listar('?municipio=monterrey&colonia=CENTRO')).nombres).toEqual(['Clínica Ñandú']);
    });

    it('RF-06: carrera filters by carrera id', async () => {
      expect((await listar(`?carrera=${carreraB.id}`)).nombres).toEqual(['Taller Beta']);
    });

    it('RF-06: turno filters institutions that include that shift', async () => {
      expect((await listar('?turno=VESPERTINO')).nombres).toEqual(['Oficina Gamma', 'Taller Beta']);
    });

    it('RF-06: tipo maps to aceptaServicio / aceptaPracticas', async () => {
      expect((await listar('?tipo=SERVICIO')).nombres).toEqual(['Clínica Ñandú', 'Inactiva Delta', 'Oficina Gamma']);
      expect((await listar('?tipo=SERVICIO_SOCIAL&q=clinica')).nombres).toEqual(['Clínica Ñandú']);
      expect((await listar('?tipo=PRACTICAS')).nombres).toEqual(['Inactiva Delta', 'Oficina Gamma', 'Taller Beta']);
    });

    it('RF-06: conCupo excludes institutions with unknown cupo', async () => {
      const { nombres } = await listar('?conCupo=true');

      expect(nombres).toEqual(['Clínica Ñandú', 'Inactiva Delta']);
      expect(nombres).not.toContain('Oficina Gamma');
      expect(nombres).not.toContain('Taller Beta');
    });

    it('RF-06: conCupo=false applies no filter', async () => {
      expect((await listar('?conCupo=false')).nombres).toHaveLength(4);
    });

    it('RF-06: filters combine', async () => {
      expect((await listar('?municipio=Monterrey&turno=MATUTINO&conCupo=true')).nombres).toEqual(['Clínica Ñandú']);
    });

    it('RF-05: ALUMNO sees only active institutions', async () => {
      const { nombres } = await listar('', cookieAlumnoFiltros);

      expect(nombres).toEqual(['Clínica Ñandú', 'Oficina Gamma', 'Taller Beta']);
    });

    it('RF-05: ALUMNO list hides codigoCorto', async () => {
      const { res } = await listar('', cookieAlumnoFiltros);

      expect(JSON.stringify(res.body)).not.toContain('codigoCorto');
    });

    it('RF-06: vinculación list includes codigoCorto', async () => {
      const { res } = await listar('');

      expect(res.body.instituciones[0]).toHaveProperty('codigoCorto');
    });

    it.each([
      ['unknown turno', '?turno=NOCTURNO'],
      ['unknown tipo', '?tipo=OTRO'],
      ['non-boolean conCupo', '?conCupo=quizas'],
      ['non-uuid carrera', '?carrera=abc'],
    ])('400 for %s', async (_caso, query) => {
      const { res } = await listar(query);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('401 without a session', async () => {
      expect((await pedir('get', '', undefined, null)).status).toBe(401);
    });

    it('RF-06: ADMIN can list', async () => {
      expect((await pedir('get', '', undefined, cookieAdmin)).status).toBe(200);
    });
  });

  describe('PATCH /api/instituciones/:id (RF-08)', () => {
    it('RF-08: edits fields, cupo, activa and carreras', async () => {
      const inst = await crearInstitucion({ plantelId, nombre: 'Editable', datos: { cupo: 2 }, carreraIds: [carreraA.id] });

      const res = await pedir('patch', `/${inst.id}`, { nombre: 'Editada', cupo: null, activa: false, carreraIds: [carreraB.id], giro: 'Retail' });

      expect(res.status).toBe(200);
      expect(res.body.institucion).toMatchObject({
        nombre: 'Editada',
        cupo: null,
        activa: false,
        giro: 'Retail',
        carreras: [{ id: carreraB.id, nombre: carreraB.nombre }],
      });
      const fila = await prisma.institucion.findUniqueOrThrow({ where: { id: inst.id }, include: { carreras: true } });
      expect(fila.carreras.map((c) => c.carreraId)).toEqual([carreraB.id]);
    });

    it('RF-08: partial edit leaves other fields and the QR untouched', async () => {
      const inst = await crearInstitucion({ plantelId, nombre: 'Parcial', datos: { cupo: 7, giro: 'Industria' } });

      const res = await pedir('patch', `/${inst.id}`, { cupo: 8 });

      expect(res.body.institucion).toMatchObject({ nombre: 'Parcial', giro: 'Industria', cupo: 8 });
      const fila = await prisma.institucion.findUniqueOrThrow({ where: { id: inst.id } });
      expect(fila.qrTokenHash).toBe(inst.qrTokenHash);
      expect(fila.codigoCorto).toBe(inst.codigoCorto);
    });

    it('RF-29: records previous and new values of each edit', async () => {
      const inst = await crearInstitucion({ plantelId, nombre: 'Antes', datos: { cupo: 1, activa: true } });

      await pedir('patch', `/${inst.id}`, { nombre: 'Después', cupo: 0, activa: false });
      await pedir('patch', `/${inst.id}`, { cupo: 5 });

      const logs = await prisma.auditLog.findMany({ where: { entidadId: inst.id }, orderBy: { fecha: 'asc' } });
      expect(logs).toHaveLength(2);
      expect(logs[0]).toMatchObject({ usuarioId: vinculacionId, accion: 'EDITAR_INSTITUCION', entidad: 'Institucion' });
      expect(logs[0]?.antes).toEqual({ nombre: 'Antes', cupo: 1, activa: true });
      expect(logs[0]?.despues).toEqual({ nombre: 'Después', cupo: 0, activa: false });
      expect(logs[1]?.antes).toEqual({ cupo: 0 });
      expect(logs[1]?.despues).toEqual({ cupo: 5 });
    });

    it('RF-29: audits carrera changes and writes nothing when no value changes', async () => {
      const inst = await crearInstitucion({ plantelId, carreraIds: [carreraA.id] });

      await pedir('patch', `/${inst.id}`, { carreraIds: [carreraB.id] });
      await pedir('patch', `/${inst.id}`, { carreraIds: [carreraB.id], nombre: inst.nombre });

      const logs = await prisma.auditLog.findMany({ where: { entidadId: inst.id } });
      expect(logs).toHaveLength(1);
      expect(logs[0]?.antes).toEqual({ carreraIds: [carreraA.id] });
      expect(logs[0]?.despues).toEqual({ carreraIds: [carreraB.id] });
    });

    it('RF-08: ADMIN can edit', async () => {
      const inst = await crearInstitucion({ plantelId });

      expect((await pedir('patch', `/${inst.id}`, { cupo: 1 }, cookieAdmin)).status).toBe(200);
    });

    it('RF-08: changing the RFC to one used in the same plantel responds 409', async () => {
      await crearInstitucion({ plantelId, datos: { rfc: 'PAT010101AB1' } });
      const inst = await crearInstitucion({ plantelId, datos: { rfc: 'PAT010101AB2' } });

      const res = await pedir('patch', `/${inst.id}`, { rfc: 'pat010101ab1' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RFC_DUPLICADO');
    });

    it('RN-03b: 404 for an institution of another plantel', async () => {
      const inst = await crearInstitucion({ plantelId: otroPlantelId });

      expect((await pedir('patch', `/${inst.id}`, { cupo: 1 })).status).toBe(404);
    });

    it('RF-08: unknown carreras respond 400', async () => {
      const inst = await crearInstitucion({ plantelId });

      const res = await pedir('patch', `/${inst.id}`, { carreraIds: [randomUUID()] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CARRERAS_INVALIDAS');
    });

    it.each([
      ['empty body', {}],
      ['empty nombre', { nombre: ' ' }],
      ['negative cupo', { cupo: -3 }],
      ['non-boolean activa', { activa: 'si' }],
      ['null nombre', { nombre: null }],
    ])('400 for %s', async (_caso, body) => {
      const inst = await crearInstitucion({ plantelId });

      const res = await pedir('patch', `/${inst.id}`, body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('401 without a session', async () => {
      expect((await pedir('patch', `/${randomUUID()}`, { cupo: 1 }, null)).status).toBe(401);
    });

    it('403 for ALUMNO', async () => {
      const inst = await crearInstitucion({ plantelId });

      const res = await pedir('patch', `/${inst.id}`, { cupo: 1 }, cookieAlumno);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
