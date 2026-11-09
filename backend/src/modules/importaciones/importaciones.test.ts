import * as XLSX from 'xlsx';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearExpediente,
  crearPlantel,
  crearUsuario,
  iniciarSesion,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { ENCABEZADOS_ALUMNOS } from './alumnos.parser.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const BASE = '/api/importaciones/alumnos';
const CARRERA = 'Carrera de prueba Programación';

type Celdas = Partial<{
  matricula: string | number;
  nombre: string;
  paterno: string;
  materno: string;
  carrera: string;
  semestre: string | number;
  grupo: string;
  turno: string;
  tipo: string;
  extra: string;
}>;

const fila = (c: Celdas = {}) => [
  c.matricula ?? '25319051760001',
  c.nombre ?? 'Ana María',
  c.paterno ?? 'López',
  c.materno ?? 'García',
  c.carrera ?? CARRERA,
  c.semestre ?? 5,
  c.grupo ?? 'a',
  c.turno ?? 'Matutino',
  c.tipo ?? 'Servicio social',
];

function xlsx(filas: unknown[][], encabezados: string[] = ENCABEZADOS_ALUMNOS): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([encabezados, ...filas]), 'Alumnos');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('importación de alumnos (RF-01)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let cookieAdmin: string;
  let cookieSocial: string;
  let cookiePracticas: string;
  let cookieAlumno: string;
  let adminId: string;
  let carreraId: string;
  let seq = 25319051770000;

  const nuevaMatricula = () => String(seq++);

  const subir = (ruta: string, cuerpo: Buffer | string, cookie: string | null = cookieAdmin, mime = XLSX_MIME) => {
    const req = request(app).post(`${BASE}/${ruta}`).set('Content-Type', mime).send(cuerpo as Buffer);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const preview = (cuerpo: Buffer | string, cookie: string | null = cookieAdmin, mime = XLSX_MIME) =>
    subir('preview', cuerpo, cookie, mime);
  const confirmar = (cuerpo: Buffer | string, cookie: string | null = cookieAdmin, mime = XLSX_MIME) =>
    subir('confirmar', cuerpo, cookie, mime);
  const contarUsuarios = () => prisma.user.count({ where: { plantelId } });

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    carreraId = (await prisma.carrera.create({ data: { nombre: CARRERA } })).id;
    const admin = await crearUsuario({ plantelId, rol: 'ADMIN' });
    adminId = admin.id;
    cookieAdmin = await iniciarSesion(app, admin);
    cookieSocial = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
    cookiePracticas = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
    const alumno = await crearUsuario({ plantelId, rol: 'ALUMNO', username: nuevaMatricula() });
    cookieAlumno = await iniciarSesion(app, alumno);
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.carrera.deleteMany({ where: { id: carreraId } });
    await prisma.$disconnect();
  });

  describe('GET /alumnos/plantilla', () => {
    it('RF-01: downloads an .xlsx with exactly the template headers', async () => {
      const res = await request(app).get(`${BASE}/plantilla`).set('Cookie', cookieSocial).buffer().parse((r, cb) => {
        const trozos: Buffer[] = [];
        r.on('data', (t: Buffer) => trozos.push(t));
        r.on('end', () => cb(null, Buffer.concat(trozos)));
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain(XLSX_MIME);
      expect(res.headers['content-disposition']).toBe('attachment; filename="plantilla-alumnos.xlsx"');
      const libro = XLSX.read(res.body as Buffer, { type: 'buffer' });
      const filas = XLSX.utils.sheet_to_json<string[]>(libro.Sheets[libro.SheetNames[0]!]!, { header: 1 });
      expect(filas).toEqual([ENCABEZADOS_ALUMNOS]);
    });

    it('returns 401 without a session', async () => {
      expect((await request(app).get(`${BASE}/plantilla`)).status).toBe(401);
    });

    it('returns 403 for a student', async () => {
      expect((await request(app).get(`${BASE}/plantilla`).set('Cookie', cookieAlumno)).status).toBe(403);
    });
  });

  describe('POST /alumnos/preview', () => {
    it('RF-01: reports what would be created and writes nothing', async () => {
      const m = nuevaMatricula();
      const antes = await contarUsuarios();

      const res = await preview(xlsx([fila({ matricula: m })]));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        resumen: { total: 1, validas: 1, conErrores: 0, crear: 1, actualizar: 0 },
        filas: [{ fila: 2, matricula: m, accion: 'CREAR', errores: [] }],
      });
      expect(await contarUsuarios()).toBe(antes);
      expect(await prisma.expediente.count({ where: { alumno: { usuario: { username: m } } } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { accion: 'IMPORTAR_ALUMNOS' } })).toBe(0);
    });

    it('RF-01: reports errors per row with the spreadsheet row number', async () => {
      const dup = nuevaMatricula();
      const res = await preview(
        xlsx([
          fila({ matricula: nuevaMatricula() }),
          fila({ matricula: dup }),
          fila({ matricula: nuevaMatricula(), carrera: 'Astrología' }),
          fila({ matricula: dup, nombre: 'Otra' }),
          fila({ matricula: nuevaMatricula(), semestre: 3 }),
        ]),
      );

      expect(res.status).toBe(200);
      expect(res.body.resumen).toEqual({ total: 5, validas: 1, conErrores: 4, crear: 1, actualizar: 0 });
      const porFila = Object.fromEntries(res.body.filas.map((f: { fila: number }) => [f.fila, f]));
      expect(porFila[2].accion).toBe('CREAR');
      expect(porFila[3].errores[0].campo).toBe('matricula');
      expect(porFila[5].errores[0].campo).toBe('matricula');
      expect(porFila[4].errores).toEqual([{ campo: 'carrera', mensaje: 'Carrera desconocida: "Astrología".' }]);
      expect(porFila[6].errores[0]).toMatchObject({ campo: 'semestre', mensaje: expect.stringContaining('RN-01') });
      expect(porFila[4].accion).toBeNull();
    });

    it('RF-01: reads a numeric 14-digit control number cell without scientific notation', async () => {
      const m = nuevaMatricula();
      const res = await preview(xlsx([fila({ matricula: Number(m) })]));

      expect(res.body.filas[0]).toMatchObject({ matricula: m, accion: 'CREAR' });
    });

    it('RF-01: accepts a comma-delimited CSV', async () => {
      const m = nuevaMatricula();
      const csv = [ENCABEZADOS_ALUMNOS.join(','), fila({ matricula: m }).join(',')].join('\n');

      const res = await preview(csv, cookieAdmin, 'text/csv');

      expect(res.status).toBe(200);
      expect(res.body.filas[0]).toMatchObject({ matricula: m, accion: 'CREAR' });
    });

    it('RF-01: accepts a semicolon-delimited CSV with BOM (Excel in Spanish locale)', async () => {
      const m = nuevaMatricula();
      const csv = '﻿' + [ENCABEZADOS_ALUMNOS.join(';'), fila({ matricula: m }).join(';')].join('\r\n');

      const res = await preview(csv, cookieAdmin, 'text/csv');

      expect(res.status).toBe(200);
      expect(res.body.filas[0]).toMatchObject({ matricula: m, accion: 'CREAR' });
    });

    it('RF-01: detects the format by content when the client sends application/octet-stream', async () => {
      const res = await preview(xlsx([fila({ matricula: nuevaMatricula() })]), cookieAdmin, 'application/octet-stream');

      expect(res.status).toBe(200);
    });

    it('RF-01: rejects missing columns with COLUMNAS_FALTANTES', async () => {
      const res = await preview(xlsx([['1', 'x']], ['Número de control', 'Nombre']));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('COLUMNAS_FALTANTES');
      expect(res.body.error.details.columnas).toContain('Carrera');
    });

    it('RF-01: rejects an empty body with ARCHIVO_INVALIDO', async () => {
      const res = await preview(Buffer.alloc(0));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ARCHIVO_INVALIDO');
    });

    it('RF-01: rejects a corrupt file with ARCHIVO_INVALIDO', async () => {
      const res = await preview(Buffer.from('PK\x03\x04no es un xlsx'));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ARCHIVO_INVALIDO');
    });

    it('RF-01: rejects a body over 2 MB with 413 and the standard error shape', async () => {
      const res = await preview(Buffer.alloc(2 * 1024 * 1024 + 1024, 'a'), cookieAdmin, 'text/csv');

      expect(res.status).toBe(413);
      expect(res.body.error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', message: expect.any(String) });
    });

    it('RF-01: rejects more than 2000 rows with ARCHIVO_DEMASIADO_GRANDE', async () => {
      const filas = Array.from({ length: 2001 }, (_, i) => fila({ matricula: String(25319050000000 + i) }));

      const res = await preview(xlsx(filas));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ARCHIVO_DEMASIADO_GRANDE');
    });

    it('RN-01: rejects students below 5th semester', async () => {
      const res = await preview(xlsx([fila({ matricula: nuevaMatricula(), semestre: 4 })]));

      expect(res.body.filas[0].errores[0].mensaje).toContain('5.º semestre');
    });

    it('RN-03b: a Servicio Social office user cannot import Prácticas rows', async () => {
      const res = await preview(
        xlsx([
          fila({ matricula: nuevaMatricula(), tipo: 'Servicio social' }),
          fila({ matricula: nuevaMatricula(), tipo: 'Prácticas' }),
        ]),
        cookieSocial,
      );

      expect(res.body.filas[0].accion).toBe('CREAR');
      expect(res.body.filas[1].accion).toBeNull();
      expect(res.body.filas[1].errores[0]).toMatchObject({ campo: 'tipo', mensaje: expect.stringContaining('RN-03b') });
    });

    it('RN-03b: a Prácticas office user cannot import Servicio social rows, and admin can import both', async () => {
      const filas = [
        fila({ matricula: nuevaMatricula(), tipo: 'Servicio social' }),
        fila({ matricula: nuevaMatricula(), tipo: 'Prácticas' }),
      ];

      const practicas = await preview(xlsx(filas), cookiePracticas);
      const admin = await preview(xlsx(filas), cookieAdmin);

      expect(practicas.body.filas.map((f: { accion: string | null }) => f.accion)).toEqual([null, 'CREAR']);
      expect(admin.body.filas.map((f: { accion: string | null }) => f.accion)).toEqual(['CREAR', 'CREAR']);
    });

    it('RF-01: marks an existing control number as ACTUALIZAR', async () => {
      const m = nuevaMatricula();
      await crearAlumnoPrecargado({ plantelId, matricula: m });

      const res = await preview(xlsx([fila({ matricula: m })]));

      expect(res.body.filas[0]).toMatchObject({ accion: 'ACTUALIZAR', errores: [] });
      expect(res.body.resumen).toMatchObject({ crear: 0, actualizar: 1 });
    });

    it('RF-01: rejects a control number that belongs to another campus or to a non-student account', async () => {
      const ajena = nuevaMatricula();
      await crearAlumnoPrecargado({ plantelId: otroPlantelId, matricula: ajena });
      const personal = nuevaMatricula();
      await crearUsuario({ plantelId, rol: 'VINCULACION', username: personal });

      const res = await preview(xlsx([fila({ matricula: ajena }), fila({ matricula: personal })]));

      expect(res.body.filas.map((f: { accion: string | null }) => f.accion)).toEqual([null, null]);
      expect(res.body.filas[0].errores[0].campo).toBe('matricula');
      expect(res.body.filas[1].errores[0].campo).toBe('matricula');
    });

    it('RN-03: a student with an active program of another type is rejected', async () => {
      const m = nuevaMatricula();
      const u = await crearAlumnoPrecargado({ plantelId, matricula: m });
      await crearExpediente({ alumnoId: u.alumno!.id, tipo: 'SERVICIO_SOCIAL', estado: 'EN_PROCESO' });

      const res = await preview(xlsx([fila({ matricula: m, tipo: 'Prácticas' })]));

      expect(res.body.filas[0].accion).toBeNull();
      expect(res.body.filas[0].errores[0]).toMatchObject({ campo: 'tipo', mensaje: expect.stringContaining('RN-03') });
    });

    it('returns 401 without a session', async () => {
      expect((await preview(xlsx([fila()]), null)).status).toBe(401);
    });

    it('returns 403 for a student', async () => {
      expect((await preview(xlsx([fila()]), cookieAlumno)).status).toBe(403);
    });
  });

  describe('POST /alumnos/confirmar', () => {
    it('RF-01: creates the user without credentials, the student and a PENDIENTE case file', async () => {
      const m = nuevaMatricula();

      const res = await confirmar(xlsx([fila({ matricula: m, grupo: ' b ', materno: '' })]));

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ resumen: { creados: 1, actualizados: 0, expedientesCreados: 1 } });
      const user = await prisma.user.findUniqueOrThrow({
        where: { username: m },
        include: { alumno: { include: { expedientes: true } }, accounts: true },
      });
      expect(user).toMatchObject({
        email: `${m}@alumno.praxis.invalid`,
        displayUsername: m,
        name: 'Ana María López',
        rol: 'ALUMNO',
        plantelId,
        activo: true,
        debeCambiar: false,
      });
      expect(user.accounts).toEqual([]);
      expect(user.alumno).toMatchObject({
        nombre: 'Ana María',
        apellidoPaterno: 'López',
        apellidoMaterno: null,
        carreraId,
        semestre: 5,
        grupo: 'B',
        turno: 'MATUTINO',
      });
      expect(user.alumno!.expedientes).toHaveLength(1);
      expect(user.alumno!.expedientes[0]).toMatchObject({ estado: 'PENDIENTE', tipo: 'SERVICIO_SOCIAL', semestre: 5 });
    });

    it('RN-02: sets 480 hours for servicio social and 240 for prácticas', async () => {
      const social = nuevaMatricula();
      const practicas = nuevaMatricula();

      await confirmar(
        xlsx([fila({ matricula: social, tipo: 'Servicio social' }), fila({ matricula: practicas, tipo: 'Prácticas' })]),
      );

      const metas = await prisma.expediente.findMany({
        where: { alumno: { usuario: { username: { in: [social, practicas] } } } },
        select: { tipo: true, metaHoras: true },
      });
      expect(Object.fromEntries(metas.map((e) => [e.tipo, e.metaHoras]))).toEqual({
        SERVICIO_SOCIAL: 480,
        PRACTICAS: 240,
      });
    });

    it('RF-02: an imported student can then be verified for activation by name', async () => {
      const m = nuevaMatricula();
      await confirmar(xlsx([fila({ matricula: m, nombre: 'Luz Elena', paterno: 'Núñez' })]));

      const res = await request(app)
        .post('/api/auth/activar/verificar')
        .set('Origin', process.env.FRONTEND_ORIGIN!)
        .set('X-Forwarded-For', '10.77.0.1')
        .send({ matricula: m, nombre: 'luz elena', apellidoPaterno: 'nunez' });

      expect(res.status).toBe(200);
    });

    it('RF-01: updates an existing control number instead of duplicating it, keeping its credentials', async () => {
      const m = nuevaMatricula();
      const previo = await crearAlumnoPrecargado({ plantelId, matricula: m, password: 'Secreta123' });
      const cuentasAntes = await prisma.account.count({ where: { userId: previo.id } });

      const res = await confirmar(xlsx([fila({ matricula: m, nombre: 'Nuevo Nombre', grupo: 'c', semestre: 6 })]));

      expect(res.status).toBe(201);
      expect(res.body.resumen).toEqual({ creados: 0, actualizados: 1, expedientesCreados: 1 });
      expect(await prisma.user.count({ where: { username: m } })).toBe(1);
      const user = await prisma.user.findUniqueOrThrow({ where: { username: m }, include: { alumno: true } });
      expect(user).toMatchObject({ id: previo.id, email: previo.email, name: 'Nuevo Nombre López García' });
      expect(user.alumno).toMatchObject({ id: previo.alumno!.id, nombre: 'Nuevo Nombre', grupo: 'C', semestre: 6, carreraId });
      expect(await prisma.account.count({ where: { userId: previo.id } })).toBe(cuentasAntes);
      expect(await prisma.expediente.count({ where: { alumnoId: previo.alumno!.id } })).toBe(1);
    });

    it('RN-03: re-importing a student with an active program of the same type updates data without a new case file', async () => {
      const m = nuevaMatricula();
      const previo = await crearAlumnoPrecargado({ plantelId, matricula: m });
      const exp = await crearExpediente({ alumnoId: previo.alumno!.id, tipo: 'PRACTICAS', estado: 'EN_PROCESO' });

      const res = await confirmar(xlsx([fila({ matricula: m, tipo: 'Prácticas', grupo: 'z' })]));

      expect(res.status).toBe(201);
      expect(res.body.resumen).toEqual({ creados: 0, actualizados: 1, expedientesCreados: 0 });
      const expedientes = await prisma.expediente.findMany({ where: { alumnoId: previo.alumno!.id } });
      expect(expedientes).toHaveLength(1);
      expect(expedientes[0]).toMatchObject({ id: exp.id, estado: 'EN_PROCESO' });
      expect((await prisma.alumno.findUniqueOrThrow({ where: { id: previo.alumno!.id } })).grupo).toBe('Z');
    });

    it('RN-03: a student with an active program of another type makes the import fail and writes nothing', async () => {
      const m = nuevaMatricula();
      const nuevo = nuevaMatricula();
      const previo = await crearAlumnoPrecargado({ plantelId, matricula: m });
      await crearExpediente({ alumnoId: previo.alumno!.id, tipo: 'SERVICIO_SOCIAL', estado: 'PENDIENTE' });

      const res = await confirmar(xlsx([fila({ matricula: nuevo }), fila({ matricula: m, tipo: 'Prácticas' })]));

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('IMPORTACION_CON_ERRORES');
      expect(await prisma.user.count({ where: { username: nuevo } })).toBe(0);
    });

    it('RN-03: a student whose previous program is finished gets a new PENDIENTE case file', async () => {
      const m = nuevaMatricula();
      const previo = await crearAlumnoPrecargado({ plantelId, matricula: m });
      await crearExpediente({ alumnoId: previo.alumno!.id, tipo: 'SERVICIO_SOCIAL', estado: 'FINALIZADO' });

      const res = await confirmar(xlsx([fila({ matricula: m, tipo: 'Prácticas', semestre: 6 })]));

      expect(res.status).toBe(201);
      expect(res.body.resumen.expedientesCreados).toBe(1);
      const nuevo = await prisma.expediente.findFirstOrThrow({ where: { alumnoId: previo.alumno!.id, tipo: 'PRACTICAS' } });
      expect(nuevo).toMatchObject({ estado: 'PENDIENTE', metaHoras: 240, semestre: 6 });
    });

    it('RF-01: with any row in error returns 422 with the same report and writes nothing', async () => {
      const bueno = nuevaMatricula();
      const malo = nuevaMatricula();
      const antes = await contarUsuarios();
      const auditoriasAntes = await prisma.auditLog.count({ where: { accion: 'IMPORTAR_ALUMNOS' } });

      const res = await confirmar(xlsx([fila({ matricula: bueno }), fila({ matricula: malo, semestre: 2 })]));

      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({ code: 'IMPORTACION_CON_ERRORES', message: expect.any(String) });
      expect(res.body.error.details.resumen).toEqual({ total: 2, validas: 1, conErrores: 1, crear: 1, actualizar: 0 });
      expect(res.body.error.details.filas[1].errores[0].campo).toBe('semestre');
      expect(await contarUsuarios()).toBe(antes);
      expect(await prisma.auditLog.count({ where: { accion: 'IMPORTAR_ALUMNOS' } })).toBe(auditoriasAntes);
    });

    it('RN-03b: a Servicio Social office user importing a Prácticas row gets 422 and nothing is written', async () => {
      const m = nuevaMatricula();

      const res = await confirmar(xlsx([fila({ matricula: m, tipo: 'Prácticas' })]), cookieSocial);

      expect(res.status).toBe(422);
      expect(await prisma.user.count({ where: { username: m } })).toBe(0);
    });

    it('RF-29: records one audit row with control numbers and counters only', async () => {
      const nuevo = nuevaMatricula();
      const existente = nuevaMatricula();
      await crearAlumnoPrecargado({ plantelId, matricula: existente });

      await confirmar(xlsx([fila({ matricula: nuevo, nombre: 'Datoprivado' }), fila({ matricula: existente })]));

      const log = await prisma.auditLog.findFirstOrThrow({
        where: { accion: 'IMPORTAR_ALUMNOS', despues: { path: ['creados'], array_contains: nuevo } },
      });
      expect(log).toMatchObject({ usuarioId: adminId, entidad: 'Importacion' });
      expect(log.despues).toEqual({ creados: [nuevo], actualizados: [existente], expedientesCreados: 2 });
      expect(JSON.stringify(log)).not.toContain('Datoprivado');
    });

    it('RNF-07: an extra CURP column is ignored and never stored', async () => {
      const m = nuevaMatricula();
      const curp = 'XEXX010101HNLXXXA4';

      const res = await confirmar(xlsx([[...fila({ matricula: m }), curp]], [...ENCABEZADOS_ALUMNOS, 'CURP']));

      expect(res.status).toBe(201);
      const user = await prisma.user.findUniqueOrThrow({ where: { username: m }, include: { alumno: true } });
      expect(JSON.stringify(user)).not.toContain(curp);
      expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain(curp);
    });

    it('rejects an empty body with ARCHIVO_INVALIDO', async () => {
      const res = await confirmar(Buffer.alloc(0));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ARCHIVO_INVALIDO');
    });

    it('returns 401 without a session', async () => {
      expect((await confirmar(xlsx([fila()]), null)).status).toBe(401);
    });

    it('returns 403 for a student', async () => {
      expect((await confirmar(xlsx([fila()]), cookieAlumno)).status).toBe(403);
    });
  });
});
