import * as XLSX from 'xlsx';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  borrarPlantel,
  crearInstitucion,
  crearPlantel,
  crearUsuario,
  iniciarSesion,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { ENCABEZADOS_INSTITUCIONES } from './instituciones.parser.js';
import { confirmarInstituciones } from './instituciones.service.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const BASE = '/api/importaciones/instituciones';
const CARRERA = 'Carrera de prueba Mantenimiento';

type Celdas = Partial<{
  nombre: string;
  rfc: string;
  giro: string;
  calle: string;
  municipio: string;
  estado: string;
  turnos: string;
  servicio: string;
  practicas: string;
  cupo: string | number;
  carreras: string;
  correo: string;
}>;

const fila = (c: Celdas = {}) => [
  c.nombre ?? 'Taller Los Pinos',
  c.rfc ?? '',
  c.giro ?? 'Automotriz',
  c.calle ?? 'Av. Constitución 100',
  '',
  '',
  'Centro',
  '64000',
  c.municipio ?? 'Monterrey',
  c.estado ?? '',
  '8112345678',
  c.correo ?? '',
  'Juan Pérez',
  'L-V 9:00 a 17:00',
  c.turnos ?? '',
  c.servicio ?? '',
  c.practicas ?? '',
  c.cupo ?? '',
  c.carreras ?? '',
];

function xlsx(filas: unknown[][], encabezados: string[] = ENCABEZADOS_INSTITUCIONES): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([encabezados, ...filas]), 'Instituciones');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('importación de instituciones (RF-07)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let cookieVinculacion: string;
  let cookieAdmin: string;
  let cookieAlumno: string;
  let usuarioId: string;
  let carreraId: string;
  let seq = 0;

  // Unique names so tests never collide with each other inside the shared campus.
  const nombre = (base = 'Empresa') => `${base} ${Date.now()}-${seq++}`;

  const subir = (ruta: string, cuerpo: Buffer | string, cookie: string | null = cookieVinculacion, mime = XLSX_MIME) => {
    const req = request(app).post(`${BASE}/${ruta}`).set('Content-Type', mime).send(cuerpo as Buffer);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const preview = (cuerpo: Buffer | string, cookie: string | null = cookieVinculacion, mime = XLSX_MIME) =>
    subir('preview', cuerpo, cookie, mime);
  const confirmar = (cuerpo: Buffer | string, cookie: string | null = cookieVinculacion, mime = XLSX_MIME) =>
    subir('confirmar', cuerpo, cookie, mime);
  const contar = (p = plantelId) => prisma.institucion.count({ where: { plantelId: p } });

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    carreraId = (await prisma.carrera.create({ data: { nombre: CARRERA } })).id;
    const vinculacion = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' });
    usuarioId = vinculacion.id;
    cookieVinculacion = await iniciarSesion(app, vinculacion);
    cookieAdmin = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ADMIN' }));
    cookieAlumno = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ALUMNO', username: '25319051799999' }));
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { usuarioId, accion: 'IMPORTAR_INSTITUCIONES' } });
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.carrera.deleteMany({ where: { id: carreraId } });
    await prisma.$disconnect();
  });

  describe('GET /instituciones/plantilla', () => {
    it('RF-07: downloads an .xlsx with exactly the template headers', async () => {
      const res = await request(app).get(`${BASE}/plantilla`).set('Cookie', cookieVinculacion).buffer().parse((r, cb) => {
        const trozos: Buffer[] = [];
        r.on('data', (t: Buffer) => trozos.push(t));
        r.on('end', () => cb(null, Buffer.concat(trozos)));
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain(XLSX_MIME);
      expect(res.headers['content-disposition']).toBe('attachment; filename="plantilla-instituciones.xlsx"');
      const libro = XLSX.read(res.body as Buffer, { type: 'buffer' });
      const filas = XLSX.utils.sheet_to_json<string[]>(libro.Sheets[libro.SheetNames[0]!]!, { header: 1 });
      expect(filas).toEqual([ENCABEZADOS_INSTITUCIONES]);
    });

    it('returns 401 without a session', async () => {
      expect((await request(app).get(`${BASE}/plantilla`)).status).toBe(401);
    });

    it('returns 403 for a student', async () => {
      expect((await request(app).get(`${BASE}/plantilla`).set('Cookie', cookieAlumno)).status).toBe(403);
    });
  });

  describe('POST /instituciones/preview', () => {
    it('RF-07: reports what would be created and writes nothing', async () => {
      const n = nombre();
      const antes = await contar();

      const res = await preview(xlsx([fila({ nombre: n })]));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        resumen: { total: 1, validas: 1, conErrores: 0, crear: 1, omitir: 0 },
        filas: [{ fila: 2, nombre: n, accion: 'CREAR', coincideCon: null, errores: [] }],
      });
      expect(await contar()).toBe(antes);
      expect(await prisma.auditLog.count({ where: { usuarioId, accion: 'IMPORTAR_INSTITUCIONES' } })).toBe(0);
    });

    it('RF-07: reports row errors with the spreadsheet row number', async () => {
      const res = await preview(
        xlsx([fila({ nombre: nombre() }), fila({ nombre: '', calle: '' }), fila({ nombre: nombre(), carreras: 'Alquimia', cupo: '-1' })]),
      );

      expect(res.status).toBe(200);
      expect(res.body.resumen).toEqual({ total: 3, validas: 1, conErrores: 2, crear: 1, omitir: 0 });
      expect(res.body.filas[1]).toMatchObject({ fila: 3, accion: null });
      expect(res.body.filas[1].errores.map((e: { campo: string }) => e.campo).sort()).toEqual(['calle', 'nombre']);
      expect(res.body.filas[2].errores.map((e: { campo: string }) => e.campo).sort()).toEqual(['carreras', 'cupo']);
    });

    it('RF-07: accepts a semicolon-delimited CSV with BOM and the octet-stream content type', async () => {
      const n = nombre();
      const csv = `${String.fromCharCode(0xfeff)}${ENCABEZADOS_INSTITUCIONES.join(';')}\r\n${fila({ nombre: n }).join(';')}\r\n`;

      const res = await preview(csv, cookieVinculacion, 'application/octet-stream');

      expect(res.status).toBe(200);
      expect(res.body.filas[0]).toMatchObject({ nombre: n, accion: 'CREAR' });
    });

    it('RF-07: rejects missing columns with COLUMNAS_FALTANTES', async () => {
      const res = await preview(xlsx([['x', 'y']], ['Nombre', 'RFC']));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('COLUMNAS_FALTANTES');
      expect(res.body.error.details.columnas).toContain('Calle');
    });

    it('RF-07: rejects an empty body and a corrupt file with ARCHIVO_INVALIDO', async () => {
      const vacio = await request(app).post(`${BASE}/preview`).set('Cookie', cookieVinculacion).set('Content-Type', XLSX_MIME);
      expect(vacio.status).toBe(400);
      expect(vacio.body.error.code).toBe('ARCHIVO_INVALIDO');
      const corrupto = await preview(Buffer.from([0, 1, 2, 3, 4]));
      expect(corrupto.status).toBe(400);
      expect(corrupto.body.error.code).toBe('ARCHIVO_INVALIDO');
    });

    it('RF-07: rejects a body over 2 MB with 413 and the standard error shape', async () => {
      const res = await preview(Buffer.alloc(2 * 1024 * 1024 + 10, 'a'), cookieVinculacion, 'text/csv');
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBeTypeOf('string');
    });

    it('RF-07: rejects more than 2000 rows with ARCHIVO_DEMASIADO_GRANDE', async () => {
      const filas = Array.from({ length: 2001 }, (_, i) => fila({ nombre: `Masiva ${i}` }));
      const res = await preview(xlsx(filas));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ARCHIVO_DEMASIADO_GRANDE');
    });

    it('RF-07: marks a row matching the catalog by RFC (case-insensitive) as OMITIR', async () => {
      const existente = await crearInstitucion({ plantelId, nombre: nombre('Existente'), datos: { rfc: 'EXI010101AA1' } });

      const res = await preview(xlsx([fila({ nombre: nombre(), rfc: 'exi010101aa1' })]));

      expect(res.body.filas[0]).toEqual({
        fila: 2,
        nombre: expect.any(String),
        accion: 'OMITIR',
        coincideCon: { id: existente.id, nombre: existente.nombre, por: 'RFC' },
        errores: [],
      });
      expect(res.body.resumen).toMatchObject({ total: 1, validas: 1, conErrores: 0, crear: 0, omitir: 1 });
    });

    it('RF-07: marks a row matching the catalog by normalized name as OMITIR', async () => {
      const base = nombre('Maquilas Ñandú');
      const existente = await crearInstitucion({ plantelId, nombre: base });

      const res = await preview(xlsx([fila({ nombre: `  ${base.toUpperCase().replace('Ñ', 'N')}  ` })]));

      expect(res.body.filas[0]).toMatchObject({
        accion: 'OMITIR',
        coincideCon: { id: existente.id, nombre: base, por: 'NOMBRE' },
      });
    });

    it('RF-07: does not match institutions of another campus', async () => {
      const n = nombre('Ajena');
      await crearInstitucion({ plantelId: otroPlantelId, nombre: n, datos: { rfc: 'AJE010101AA1' } });

      const res = await preview(xlsx([fila({ nombre: n, rfc: 'AJE010101AA1' })]));

      expect(res.body.filas[0]).toMatchObject({ accion: 'CREAR', coincideCon: null });
    });

    it('RF-07: a row repeated inside the file is a row error, the first occurrence stays valid', async () => {
      const n = nombre('Repetida');

      const res = await preview(xlsx([fila({ nombre: n, rfc: 'REP010101AA1' }), fila({ nombre: nombre(), rfc: 'rep010101aa1' }), fila({ nombre: n.toUpperCase() })]));

      expect(res.body.resumen).toMatchObject({ validas: 1, conErrores: 2, crear: 1 });
      expect(res.body.filas[0].accion).toBe('CREAR');
      expect(res.body.filas[1].errores[0].campo).toBe('rfc');
      expect(res.body.filas[2].errores[0].campo).toBe('nombre');
    });

    it('returns 401 without a session', async () => {
      expect((await preview(xlsx([fila()]), null)).status).toBe(401);
    });

    it('returns 403 for a student', async () => {
      expect((await preview(xlsx([fila()]), cookieAlumno)).status).toBe(403);
    });
  });

  describe('POST /instituciones/confirmar', () => {
    it('RF-07: creates each institution with defaults, its own QR hash and short code (RNF-06)', async () => {
      const a = nombre('Alfa');
      const b = nombre('Beta');

      const res = await confirmar(
        xlsx([
          fila({ nombre: a, rfc: 'alf010101aa1', turnos: 'Matutino, vespertino', carreras: CARRERA.toLowerCase(), cupo: 5, servicio: 'Sí', practicas: 'no' }),
          fila({ nombre: b }),
        ]),
      );

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ resumen: { creados: 2, omitidos: 0 } });
      const [ia, ib] = await Promise.all([
        prisma.institucion.findFirstOrThrow({ where: { plantelId, nombre: a }, include: { carreras: true } }),
        prisma.institucion.findFirstOrThrow({ where: { plantelId, nombre: b }, include: { carreras: true } }),
      ]);
      expect(ia).toMatchObject({
        rfc: 'ALF010101AA1',
        turnos: ['MATUTINO', 'VESPERTINO'],
        cupo: 5,
        aceptaServicio: true,
        aceptaPracticas: false,
        activa: true,
        esPlantel: false,
      });
      expect(ia.carreras.map((c) => c.carreraId)).toEqual([carreraId]);
      expect(ib).toMatchObject({ estado: 'Nuevo León', rfc: null, cupo: null, turnos: [], aceptaServicio: true, aceptaPracticas: true });
      expect(ia.qrTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(ia.codigoCorto).toMatch(/^[A-Z2-9]{6}$/);
      expect(ia.qrTokenHash).not.toBe(ib.qrTokenHash);
      expect(ia.codigoCorto).not.toBe(ib.codigoCorto);
    });

    it('RF-07: skips rows matching the catalog without modifying them, and creates the rest', async () => {
      const existente = await crearInstitucion({
        plantelId,
        nombre: nombre('Intacta'),
        datos: { rfc: 'INT010101AA1', giro: 'Original', cupo: 3 },
      });
      const nueva = nombre('Nueva');

      const res = await confirmar(xlsx([fila({ nombre: nombre(), rfc: 'INT010101AA1', giro: 'Cambiado', cupo: 99 }), fila({ nombre: nueva })]));

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ resumen: { creados: 1, omitidos: 1 } });
      expect(await prisma.institucion.findUniqueOrThrow({ where: { id: existente.id } })).toMatchObject({
        giro: 'Original',
        cupo: 3,
        nombre: existente.nombre,
        qrTokenHash: existente.qrTokenHash,
      });
      expect(await prisma.institucion.count({ where: { plantelId, nombre: nueva } })).toBe(1);
    });

    it('RF-07: is idempotent, a second confirmation skips everything', async () => {
      const cuerpo = xlsx([fila({ nombre: nombre('Idem') })]);
      expect((await confirmar(cuerpo)).body).toEqual({ resumen: { creados: 1, omitidos: 0 } });
      expect((await confirmar(cuerpo)).body).toEqual({ resumen: { creados: 0, omitidos: 1 } });
    });

    it('RF-07: with any row error it answers 422 IMPORTACION_CON_ERRORES and imports nothing', async () => {
      const buena = nombre('Buena');
      const antes = await contar();

      const res = await confirmar(xlsx([fila({ nombre: buena }), fila({ nombre: nombre(), turnos: 'Nocturno' })]));

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('IMPORTACION_CON_ERRORES');
      expect(res.body.error.details.resumen).toMatchObject({ total: 2, validas: 1, conErrores: 1 });
      expect(res.body.error.details.filas[1].errores[0].campo).toBe('turnos');
      expect(await contar()).toBe(antes);
      expect(await prisma.institucion.count({ where: { plantelId, nombre: buena } })).toBe(0);
    });

    it('RF-07: a duplicate inside the file blocks the confirmation', async () => {
      const n = nombre('Doble');
      const antes = await contar();

      const res = await confirmar(xlsx([fila({ nombre: n }), fila({ nombre: n })]));

      expect(res.status).toBe(422);
      expect(await contar()).toBe(antes);
    });

    it('RF-29: audits the import with counters, ids and names only', async () => {
      await prisma.auditLog.deleteMany({ where: { usuarioId, accion: 'IMPORTAR_INSTITUCIONES' } });
      const n = nombre('Auditada');

      await confirmar(xlsx([fila({ nombre: n, rfc: 'AUD010101AA1', correo: 'x@auditoria.mx' })]));

      const registros = await prisma.auditLog.findMany({ where: { usuarioId, accion: 'IMPORTAR_INSTITUCIONES' } });
      expect(registros).toHaveLength(1);
      const creada = await prisma.institucion.findFirstOrThrow({ where: { plantelId, nombre: n } });
      expect(registros[0]).toMatchObject({ entidad: 'Importacion' });
      expect(registros[0]!.despues).toEqual({ creados: 1, omitidos: 0, instituciones: [{ id: creada.id, nombre: n }] });
      expect(JSON.stringify(registros[0]!.despues)).not.toContain('AUD010101AA1');
      expect(JSON.stringify(registros[0]!.despues)).not.toContain(creada.qrTokenHash);
    });

    it('RF-07: an ADMIN can import too', async () => {
      const res = await confirmar(xlsx([fila({ nombre: nombre('Admin') })]), cookieAdmin);
      expect(res.status).toBe(201);
    });

    it('RF-07: retries a short-code collision with fresh credentials', async () => {
      const existente = await crearInstitucion({ plantelId, nombre: nombre('Codigo') });
      const generados = [
        { token: 't1', qrTokenHash: `hash-a-${Date.now()}`, codigoCorto: existente.codigoCorto },
        { token: 't2', qrTokenHash: `hash-b-${Date.now()}`, codigoCorto: 'ZZZZZ9' },
      ];
      const n = nombre('Reintento');
      const usuario = { id: usuarioId, plantelId, rol: 'VINCULACION' } as Parameters<typeof confirmarInstituciones>[0];

      const res = await confirmarInstituciones(usuario, xlsx([fila({ nombre: n })]), () => generados.shift()!);

      expect(res.resumen).toEqual({ creados: 1, omitidos: 0 });
      expect(await prisma.institucion.findFirstOrThrow({ where: { plantelId, nombre: n } })).toMatchObject({ codigoCorto: 'ZZZZZ9' });
    });

    it('returns 401 without a session', async () => {
      expect((await confirmar(xlsx([fila()]), null)).status).toBe(401);
    });

    it('returns 403 for a student', async () => {
      expect((await confirmar(xlsx([fila()]), cookieAlumno)).status).toBe(403);
    });
  });
});
