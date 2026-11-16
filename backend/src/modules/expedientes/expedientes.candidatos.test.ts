import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EstadoExpediente, TipoPrograma } from '../../generated/prisma/enums.js';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearAsistencia,
  crearExpediente,
  crearPlantel,
  crearUsuario,
  iniciarSesion,
  PASSWORD_PRUEBA,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

describe('GET /api/expedientes/candidatos (RF-01, RN-03a, RN-03b)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let cookiePracticas: string;
  let cookieServicio: string;
  let cookieAdmin: string;
  let cookieAlumno: string;
  let contador = 0;

  // `null` means no session cookie.
  const pedir = (cookie: string | null = cookiePracticas) => {
    const req = request(app).get('/api/expedientes/candidatos').set('Origin', ORIGIN);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  type Previo = { tipo: TipoPrograma; estado: EstadoExpediente; datos?: Parameters<typeof crearExpediente>[0]['datos'] };
  type OpcionesAlumno = {
    semestre?: number;
    plantel?: string;
    expedientes?: Previo[];
    nombre?: string;
    apellidoPaterno?: string;
    apellidoMaterno?: string;
  };

  // A student with the given case files (oldest first).
  async function alumno({
    semestre = 6,
    plantel = plantelId,
    expedientes = [],
    nombre = 'Ana María',
    apellidoPaterno = 'López',
    apellidoMaterno = 'García',
  }: OpcionesAlumno = {}) {
    contador++;
    const matricula = `2531905377${String(contador).padStart(4, '0')}`;
    const usuario = await crearAlumnoPrecargado({ plantelId: plantel, matricula, nombre, apellidoPaterno, apellidoMaterno });
    const alumnoId = usuario.alumno!.id;
    await prisma.alumno.update({ where: { id: alumnoId }, data: { semestre } });
    const creados = [];
    for (const [i, e] of expedientes.entries()) {
      creados.push(
        await crearExpediente({
          alumnoId,
          tipo: e.tipo,
          estado: e.estado,
          semestre: 5,
          // Distinct, increasing creation times so "the first program" is well defined.
          datos: { creadoEn: new Date(Date.UTC(2026, 0, 1 + i)), ...e.datos },
        }),
      );
    }
    return { usuario, alumnoId, matricula, expedientes: creados };
  }
  const egresado = (primero: TipoPrograma, extra: OpcionesAlumno = {}) =>
    alumno({ ...extra, expedientes: [{ tipo: primero, estado: 'FINALIZADO' }] });

  type Fila = { alumnoId: string; programaTerminado: string; tipoAsignable: string; terminadoEn: string | null };
  const ids = (body: { candidatos: Fila[] }) => body.candidatos.map((c) => c.alumnoId);
  const fila = (body: { candidatos: Fila[] }, alumnoId: string) => body.candidatos.find((c) => c.alumnoId === alumnoId);

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    cookiePracticas = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
    cookieServicio = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
    cookieAdmin = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ADMIN' }));
    const sesionAlumno = await crearAlumnoPrecargado({ plantelId, matricula: '25319053770000', password: PASSWORD_PRUEBA });
    cookieAlumno = await iniciarSesion(app, sesionAlumno);
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  it('RN-03b: Prácticas sees who finished servicio social, and servicio social sees who finished prácticas', async () => {
    const trasServicio = await egresado('SERVICIO_SOCIAL');
    const trasPracticas = await egresado('PRACTICAS');

    const resPracticas = await pedir(cookiePracticas);
    const resServicio = await pedir(cookieServicio);

    expect(resPracticas.status).toBe(200);
    expect(ids(resPracticas.body)).toContain(trasServicio.alumnoId);
    expect(ids(resPracticas.body)).not.toContain(trasPracticas.alumnoId);
    expect(ids(resServicio.body)).toContain(trasPracticas.alumnoId);
    expect(ids(resServicio.body)).not.toContain(trasServicio.alumnoId);
    expect(fila(resPracticas.body, trasServicio.alumnoId)).toMatchObject({
      programaTerminado: 'SERVICIO_SOCIAL',
      tipoAsignable: 'PRACTICAS',
    });
    expect(fila(resServicio.body, trasPracticas.alumnoId)).toMatchObject({
      programaTerminado: 'PRACTICAS',
      tipoAsignable: 'SERVICIO_SOCIAL',
    });
  });

  it('RN-03b: the administrator sees both, each with its tipoAsignable', async () => {
    const trasServicio = await egresado('SERVICIO_SOCIAL');
    const trasPracticas = await egresado('PRACTICAS');

    const res = await pedir(cookieAdmin);

    expect(res.status).toBe(200);
    expect(fila(res.body, trasServicio.alumnoId)).toMatchObject({ programaTerminado: 'SERVICIO_SOCIAL', tipoAsignable: 'PRACTICAS' });
    expect(fila(res.body, trasPracticas.alumnoId)).toMatchObject({ programaTerminado: 'PRACTICAS', tipoAsignable: 'SERVICIO_SOCIAL' });
  });

  it('RNF-07: returns only the minimal student data (full name, matrícula, carrera, semestre, grupo, turno)', async () => {
    const c = await egresado('SERVICIO_SOCIAL', { nombre: 'Luis', apellidoPaterno: 'Pérez', apellidoMaterno: 'Soto' });

    const res = await pedir(cookiePracticas);

    const f = fila(res.body, c.alumnoId)!;
    expect(Object.keys(f).sort()).toEqual(
      ['alumnoId', 'carrera', 'grupo', 'matricula', 'nombre', 'programaTerminado', 'semestre', 'terminadoEn', 'tipoAsignable', 'turno'].sort(),
    );
    expect(f).toMatchObject({ nombre: 'Luis Pérez Soto', matricula: c.matricula, semestre: 6, grupo: 'A' });
    expect(typeof (f as unknown as { carrera: unknown }).carrera).toBe('string');
  });

  it('RF-01: terminadoEn is the local date of the last attendance of the finished case file', async () => {
    const c = await egresado('SERVICIO_SOCIAL');
    await crearAsistencia({ expedienteId: c.expedientes[0]!.id, entrada: new Date('2026-05-04T14:00:00Z'), minutos: 60 });
    // 2026-05-09 03:30 UTC is still May 8 in America/Monterrey (RN-15).
    await crearAsistencia({ expedienteId: c.expedientes[0]!.id, entrada: new Date('2026-05-09T02:30:00Z'), minutos: 60 });

    const res = await pedir(cookiePracticas);

    expect(fila(res.body, c.alumnoId)!.terminadoEn).toBe('2026-05-08');
  });

  it('RF-01: terminadoEn falls back to fechaTermino, and is null when the data has no date', async () => {
    const conFecha = await alumno({
      expedientes: [{ tipo: 'SERVICIO_SOCIAL', estado: 'FINALIZADO', datos: { fechaTermino: new Date('2026-06-15') } }],
    });
    const sinFecha = await egresado('SERVICIO_SOCIAL');

    const res = await pedir(cookiePracticas);

    expect(fila(res.body, conFecha.alumnoId)!.terminadoEn).toBe('2026-06-15');
    expect(fila(res.body, sinFecha.alumnoId)!.terminadoEn).toBeNull();
  });

  it('RF-01: orders by surname, then second surname and name', async () => {
    const z = await egresado('SERVICIO_SOCIAL', { apellidoPaterno: 'Zzorden', apellidoMaterno: 'A', nombre: 'A' });
    const a2 = await egresado('SERVICIO_SOCIAL', { apellidoPaterno: 'Aaorden', apellidoMaterno: 'B', nombre: 'A' });
    const a1 = await egresado('SERVICIO_SOCIAL', { apellidoPaterno: 'Aaorden', apellidoMaterno: 'A', nombre: 'Z' });

    const res = await pedir(cookiePracticas);

    const orden = ids(res.body).filter((id) => [z.alumnoId, a1.alumnoId, a2.alumnoId].includes(id));
    expect(orden).toEqual([a1.alumnoId, a2.alumnoId, z.alumnoId]);
  });

  it('RN-03a: excludes a student whose first program is not finished', async () => {
    const enProceso = await alumno({ expedientes: [{ tipo: 'SERVICIO_SOCIAL', estado: 'EN_PROCESO' }] });
    const cancelado = await alumno({ expedientes: [{ tipo: 'SERVICIO_SOCIAL', estado: 'CANCELADO' }] });
    const sinExpediente = await alumno();

    const res = await pedir(cookieAdmin);

    for (const x of [enProceso, cancelado, sinExpediente]) expect(ids(res.body)).not.toContain(x.alumnoId);
  });

  it('RN-03: excludes a student who already has an active case file', async () => {
    const activos = [];
    for (const estado of ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'] as const) {
      activos.push(
        await alumno({
          expedientes: [
            { tipo: 'SERVICIO_SOCIAL', estado: 'FINALIZADO' },
            { tipo: 'PRACTICAS', estado },
          ],
        }),
      );
    }

    const res = await pedir(cookieAdmin);

    for (const x of activos) expect(ids(res.body)).not.toContain(x.alumnoId);
  });

  it('RN-03a: excludes a student who already finished both programs', async () => {
    const ambos = await alumno({
      expedientes: [
        { tipo: 'SERVICIO_SOCIAL', estado: 'FINALIZADO' },
        { tipo: 'PRACTICAS', estado: 'FINALIZADO' },
      ],
    });

    const res = await pedir(cookieAdmin);

    expect(ids(res.body)).not.toContain(ambos.alumnoId);
  });

  it('RN-03a: a cancelled attempt of the second program does not exclude the student', async () => {
    const reintento = await alumno({
      expedientes: [
        { tipo: 'SERVICIO_SOCIAL', estado: 'FINALIZADO' },
        { tipo: 'PRACTICAS', estado: 'CANCELADO' },
      ],
    });

    const res = await pedir(cookiePracticas);

    expect(ids(res.body)).toContain(reintento.alumnoId);
  });

  it('RN-03a: excludes 5th-semester students (the second program starts in 6th)', async () => {
    const quinto = await egresado('SERVICIO_SOCIAL', { semestre: 5 });
    const sexto = await egresado('SERVICIO_SOCIAL', { semestre: 6 });

    const res = await pedir(cookiePracticas);

    expect(ids(res.body)).not.toContain(quinto.alumnoId);
    expect(ids(res.body)).toContain(sexto.alumnoId);
  });

  it('RN-03b: never lists students of another plantel', async () => {
    const ajeno = await egresado('SERVICIO_SOCIAL', { plantel: otroPlantelId });

    const res = await pedir(cookieAdmin);

    expect(ids(res.body)).not.toContain(ajeno.alumnoId);
  });

  it('RN-03a: a listed candidate is accepted by POST /asignar and then stops being a candidate', async () => {
    const c = await egresado('PRACTICAS');
    expect(ids((await pedir(cookieServicio)).body)).toContain(c.alumnoId);

    const res = await request(app)
      .post('/api/expedientes/asignar')
      .set('Origin', ORIGIN)
      .set('Cookie', cookieServicio)
      .send({ alumnoIds: [c.alumnoId] });

    expect(res.body.asignados).toHaveLength(1);
    expect(ids((await pedir(cookieServicio)).body)).not.toContain(c.alumnoId);
  });

  it('RF-01: 401 without session and 403 for a student', async () => {
    expect((await pedir(null)).status).toBe(401);
    expect((await pedir(cookieAlumno)).status).toBe(403);
  });

  it('RF-01: /candidatos is not parsed as a case file id (no 400 for an invalid uuid)', async () => {
    const res = await pedir(cookieAdmin);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.candidatos)).toBe(true);
  });
});
