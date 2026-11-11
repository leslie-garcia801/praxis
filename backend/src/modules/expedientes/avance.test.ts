import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EstadoExpediente, TipoPrograma } from '../../generated/prisma/enums.js';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearAsistencia,
  crearExpediente,
  crearPlantel,
  crearSemana,
  crearUsuario,
  iniciarSesion,
  PASSWORD_PRUEBA,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { instanteLocal, sumarDias } from '../../lib/tiempo.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;
const HOY = '2026-11-11';

describe('GET /api/expedientes/:id/avance (RF-18, RN-11, RN-16)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let cookiePracticas: string;
  let cookieServicio: string;
  let cookieAdmin: string;
  let cookieOtroPlantel: string;
  let contador = 0;

  // Only Date is faked: the database and sockets keep working.
  const pedir = async (id: string, cookie: string | null = cookiePracticas) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instanteLocal(HOY, '12:00'));
    const req = request(app).get(`/api/expedientes/${id}/avance`).set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    try {
      return await req;
    } finally {
      vi.useRealTimers();
    }
  };

  async function caso({
    tipo = 'PRACTICAS',
    estado = 'EN_PROCESO' as EstadoExpediente,
    minutosTransferidos = 0,
  }: { tipo?: TipoPrograma; estado?: EstadoExpediente; minutosTransferidos?: number } = {}) {
    contador++;
    const usuario = await crearAlumnoPrecargado({
      plantelId,
      matricula: `2531905399${String(contador).padStart(4, '0')}`,
      password: PASSWORD_PRUEBA,
    });
    const expediente = await crearExpediente({ alumnoId: usuario.alumno!.id, tipo, estado, datos: { minutosTransferidos } });
    return { usuario, id: expediente.id, cookie: () => iniciarSesion(app, usuario) };
  }

  // Closed shift of `minutos` minutes starting at 10:00 local on `dia`.
  const turno = (expedienteId: string, dia: string, minutos: number, extra: Partial<Parameters<typeof crearAsistencia>[0]> = {}) =>
    crearAsistencia({ expedienteId, entrada: instanteLocal(dia, '10:00'), minutos, ...extra });

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    cookiePracticas = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
    cookieServicio = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
    cookieAdmin = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ADMIN' }));
    cookieOtroPlantel = await iniciarSesion(app, await crearUsuario({ plantelId: otroPlantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  it('RF-18: un expediente sin asistencias devuelve ceros y la meta completa', async () => {
    const c = await caso({ tipo: 'SERVICIO_SOCIAL' });
    const res = await pedir(c.id, await c.cookie());

    expect(res.status).toBe(200);
    expect(res.body.avance).toEqual({
      expedienteId: c.id,
      metaMinutos: 480 * 60,
      minutosValidados: 0,
      minutosRegistrados: 0,
      minutosFaltantes: 480 * 60,
      porcentaje: 0,
      fechaEstimada: { tipo: 'SIN_DATOS' },
      turnoAbierto: null,
    });
  });

  it('RN-11: separa horas validadas de registradas', async () => {
    const c = await caso({ minutosTransferidos: 60 });
    await crearSemana({ expedienteId: c.id, semanaInicio: '2026-03-02', estado: 'VALIDADA', minutos: [120, 60] });
    await crearSemana({ expedienteId: c.id, semanaInicio: '2026-03-09', estado: 'ENVIADA', minutos: [30] });
    await turno(c.id, '2026-11-09', 90); // sin semana asignada
    await turno(c.id, '2026-11-10', 40, { estado: 'INCOMPLETA', minutosAcreditables: 0 }); // RN-08: aporta 0

    const res = await pedir(c.id, await c.cookie());

    expect(res.status).toBe(200);
    expect(res.body.avance).toMatchObject({
      metaMinutos: 240 * 60,
      minutosValidados: 240, // 120 + 60 + 60 transferidos
      minutosRegistrados: 120, // 30 (semana enviada) + 90 (sin semana)
      minutosFaltantes: 240 * 60 - 240, // solo las validadas restan
      porcentaje: 1, // 240 / 14400 = 1.67 % → hacia abajo
    });
  });

  it('RN-11: el porcentaje tiene tope de 100 y no hay faltantes', async () => {
    const c = await caso({ minutosTransferidos: 240 * 60 + 500 });
    const res = await pedir(c.id, await c.cookie());

    expect(res.body.avance).toMatchObject({ porcentaje: 100, minutosFaltantes: 0, fechaEstimada: { tipo: 'COMPLETADO' } });
  });

  it('RN-16: sin datos suficientes con menos de 5 días', async () => {
    const c = await caso();
    for (const dia of ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09']) await turno(c.id, dia, 120);

    const res = await pedir(c.id, await c.cookie());

    expect(res.body.avance.fechaEstimada).toEqual({ tipo: 'SIN_DATOS' });
  });

  it('RN-16: estima la fecha con el promedio de 28 días', async () => {
    const c = await caso();
    // 10 days of 120 min, the first one 27 days before today → denominator of 28 days.
    for (let i = 0; i < 10; i++) await turno(c.id, sumarDias('2026-10-15', i), 120);

    const res = await pedir(c.id, await c.cookie());

    // Nothing is validated yet, but 1200 min are registered: the estimate uses 14400 − 0 − 1200 = 13200.
    // ceil(13200 / (1200 / 28)) = 308 days.
    expect(res.body.avance.minutosRegistrados).toBe(1200);
    expect(res.body.avance.minutosFaltantes).toBe(14400);
    expect(res.body.avance.fechaEstimada).toEqual({
      tipo: 'ESTIMADA',
      fecha: sumarDias(HOY, 308),
      promedioMinutosDia: 43,
    });
  });

  it('RF-18: devuelve el turno abierto con su id y entrada', async () => {
    const c = await caso();
    const abierto = await crearAsistencia({ expedienteId: c.id, entrada: instanteLocal(HOY, '08:00') });

    const res = await pedir(c.id, await c.cookie());

    expect(res.body.avance.turnoAbierto).toEqual({ id: abierto.id, entrada: instanteLocal(HOY, '08:00').toISOString() });
    expect(res.body.avance.minutosRegistrados).toBe(0);
  });

  describe('acceso', () => {
    it('RN-03b: vinculación de la oficina del expediente y admin pueden verlo', async () => {
      const c = await caso();
      expect((await pedir(c.id, cookiePracticas)).status).toBe(200);
      expect((await pedir(c.id, cookieAdmin)).status).toBe(200);
    });

    it('RN-03b: vinculación de otra oficina recibe 403', async () => {
      const c = await caso({ tipo: 'PRACTICAS' });
      const res = await pedir(c.id, cookieServicio);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('el alumno no ve el avance de otro alumno (403)', async () => {
      const a = await caso();
      const b = await caso();
      expect((await pedir(a.id, await b.cookie())).status).toBe(403);
    });

    it('un expediente de otro plantel responde 404', async () => {
      const c = await caso();
      expect((await pedir(c.id, cookieOtroPlantel)).status).toBe(404);
    });

    it('sin sesión responde 401', async () => {
      const c = await caso();
      expect((await pedir(c.id, null)).status).toBe(401);
    });

    it('un identificador inválido responde 400', async () => {
      const res = await pedir('no-es-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
