import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarPlantel, crearInstitucion, crearPlantel, crearUsuario, iniciarSesion } from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { generarCredencialesQr, hashTokenQr } from '../../domain/qrInstitucion.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { regenerarQrInstitucion } from './instituciones.service.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

describe('POST /api/instituciones/:id/qr (RF-13, RF-15, RNF-06)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let vinculacionId: string;
  let cookieVinculacion: string;
  let cookieAdmin: string;
  let cookieAlumno: string;

  const generar = (id: string, cookie: string | null = cookieVinculacion) => {
    const req = request(app)
      .post(`/api/instituciones/${id}/qr`)
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
  const usuario = () => ({ id: vinculacionId, plantelId }) as AuthUser;
  const tokenDe = (url: string) => url.slice(url.lastIndexOf('/') + 1);

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    const vinculacion = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' });
    vinculacionId = vinculacion.id;
    cookieVinculacion = await iniciarSesion(app, vinculacion);
    cookieAdmin = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ADMIN' }));
    cookieAlumno = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ALUMNO' }));
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  it('RF-13: the stored hash is the sha256 of the token in the QR URL, and the code changes', async () => {
    const antes = await crearInstitucion({ plantelId, nombre: 'Hospital Muñoz' });

    const { url, pdf } = await regenerarQrInstitucion(usuario(), antes.id);

    expect(url).toMatch(new RegExp(`^${ORIGIN}/s/[A-Za-z0-9_-]{43}$`));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const despues = await prisma.institucion.findUniqueOrThrow({ where: { id: antes.id } });
    expect(despues.qrTokenHash).toBe(hashTokenQr(tokenDe(url)));
    expect(despues.qrTokenHash).not.toBe(antes.qrTokenHash);
    expect(despues.codigoCorto).not.toBe(antes.codigoCorto);
    expect(despues.codigoCorto).toMatch(/^[A-Z2-9]{6}$/);
  });

  it('RNF-06: the raw token is neither stored in the institution row nor in the audit log', async () => {
    const inst = await crearInstitucion({ plantelId });

    const { url } = await regenerarQrInstitucion(usuario(), inst.id);

    const token = tokenDe(url);
    const fila = await prisma.institucion.findUniqueOrThrow({ where: { id: inst.id } });
    const auditoria = await prisma.auditLog.findMany({ where: { entidadId: inst.id } });
    expect(JSON.stringify(fila)).not.toContain(token);
    expect(JSON.stringify(auditoria)).not.toContain(token);
    expect(JSON.stringify(auditoria)).not.toContain(fila.qrTokenHash);
  });

  it('RF-29: audits REGENERAR_QR on the institution, without secrets', async () => {
    const inst = await crearInstitucion({ plantelId });

    await regenerarQrInstitucion(usuario(), inst.id);

    const registros = await prisma.auditLog.findMany({ where: { entidadId: inst.id, accion: 'REGENERAR_QR' } });
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({ usuarioId: vinculacionId, entidad: 'Institucion' });
  });

  it('RF-15: retries with fresh credentials when the new code or hash collides', async () => {
    const otra = await crearInstitucion({ plantelId, datos: { codigoCorto: 'REGCO1' } });
    const inst = await crearInstitucion({ plantelId });
    let llamadas = 0;
    const generador = () => {
      llamadas++;
      if (llamadas === 1) return { token: 't1', qrTokenHash: hashTokenQr('t1-reg'), codigoCorto: otra.codigoCorto };
      return { token: 'tok-final', qrTokenHash: hashTokenQr('tok-final'), codigoCorto: 'REGCO2' };
    };

    const { url } = await regenerarQrInstitucion(usuario(), inst.id, generador);

    expect(llamadas).toBe(2);
    expect(tokenDe(url)).toBe('tok-final');
    const fila = await prisma.institucion.findUniqueOrThrow({ where: { id: inst.id } });
    expect(fila.codigoCorto).toBe('REGCO2');
  });

  it('gives up after 5 collisions and leaves the previous credentials untouched', async () => {
    const otra = await crearInstitucion({ plantelId, datos: { codigoCorto: 'REGCO3' } });
    const inst = await crearInstitucion({ plantelId });
    let llamadas = 0;
    const generador = () => {
      llamadas++;
      return { token: 't', qrTokenHash: hashTokenQr(randomUUID()), codigoCorto: otra.codigoCorto };
    };

    await expect(regenerarQrInstitucion(usuario(), inst.id, generador)).rejects.toThrow();

    expect(llamadas).toBe(5);
    const fila = await prisma.institucion.findUniqueOrThrow({ where: { id: inst.id } });
    expect(fila.qrTokenHash).toBe(inst.qrTokenHash);
    expect(fila.codigoCorto).toBe(inst.codigoCorto);
    expect(await prisma.auditLog.count({ where: { entidadId: inst.id, accion: 'REGENERAR_QR' } })).toBe(0);
  });

  it('answers a PDF download with an ASCII-safe filename; each call replaces the previous credentials', async () => {
    const inst = await crearInstitucion({ plantelId, nombre: 'Clínica Peñalosa & Asociados' });

    const primera = await generar(inst.id);
    const trasPrimera = await prisma.institucion.findUniqueOrThrow({ where: { id: inst.id } });
    const segunda = await generar(inst.id, cookieAdmin);
    const trasSegunda = await prisma.institucion.findUniqueOrThrow({ where: { id: inst.id } });

    expect(primera.status).toBe(200);
    expect(primera.headers['content-type']).toMatch(/^application\/pdf/);
    expect(primera.headers['content-disposition']).toBe('attachment; filename="qr-clinica-penalosa-asociados.pdf"');
    expect((primera.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect(segunda.status).toBe(200);
    expect(trasSegunda.qrTokenHash).not.toBe(trasPrimera.qrTokenHash);
    expect(trasSegunda.codigoCorto).not.toBe(trasPrimera.codigoCorto);
  });

  it('falls back to a generic filename when the name has no ASCII letters or digits', async () => {
    const inst = await crearInstitucion({ plantelId, nombre: '日本語' });

    const res = await generar(inst.id);

    expect(res.headers['content-disposition']).toBe('attachment; filename="qr-institucion.pdf"');
  });

  it('401 without a session', async () => {
    const inst = await crearInstitucion({ plantelId });
    expect((await generar(inst.id, null)).status).toBe(401);
  });

  it('403 for a student, and nothing changes', async () => {
    const inst = await crearInstitucion({ plantelId });
    expect((await generar(inst.id, cookieAlumno)).status).toBe(403);
    const fila = await prisma.institucion.findUniqueOrThrow({ where: { id: inst.id } });
    expect(fila.qrTokenHash).toBe(inst.qrTokenHash);
  });

  it('404 for an institution of another plantel, and nothing changes', async () => {
    const ajena = await crearInstitucion({ plantelId: otroPlantelId });
    const res = await generar(ajena.id);
    expect(res.status).toBe(404);
    const fila = await prisma.institucion.findUniqueOrThrow({ where: { id: ajena.id } });
    expect(fila.qrTokenHash).toBe(ajena.qrTokenHash);
  });

  it('404 for a missing institution', async () => {
    expect((await generar(randomUUID())).status).toBe(404);
  });

  it('400 VALIDATION_ERROR for a non-uuid id', async () => {
    const res = await request(app).post('/api/instituciones/no-es-uuid/qr').set('Origin', ORIGIN).set('Cookie', cookieVinculacion);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('keeps the credential generator producing a hash that matches its token (sanity)', () => {
    const { token, qrTokenHash } = generarCredencialesQr();
    expect(hashTokenQr(token)).toBe(qrTokenHash);
  });
});
