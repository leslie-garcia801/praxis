import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearExpediente,
  crearInstitucion,
  crearPlantel,
  crearSemana,
  crearSupervisor,
  crearUsuario,
  iniciarSesion,
  PASSWORD_PRUEBA,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { correosEnviados, limpiarCorreos } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import { ejecutarResumenSemanal } from '../validacion/resumenSemanal.service.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

// RF-21, RF-21a: the office sends the supervisor's link now instead of waiting for the Monday job.
describe('POST /api/expedientes/:id/enlace-validacion (RF-21, RF-21a)', () => {
  const app = createApp();
  let plantelId: string;
  let institucionId: string;
  let cookiePracticas: string;
  let cookieServicio: string;
  let matricula = 25319064001000;

  const enviar = (id: string, cookie: string | null = cookiePracticas) => {
    const req = request(app).post(`/api/expedientes/${id}/enlace-validacion`).set('Origin', ORIGIN);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  async function alumnoDe(supervisorId: string | null) {
    const usuario = await crearAlumnoPrecargado({ plantelId, matricula: String(matricula++), password: PASSWORD_PRUEBA });
    const expediente = await crearExpediente({
      alumnoId: usuario.alumno!.id,
      tipo: 'PRACTICAS',
      institucionId,
      datos: { supervisorId },
    });
    return { usuario, expediente };
  }

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    institucionId = (await crearInstitucion({ plantelId })).id;
    cookiePracticas = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
    cookieServicio = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
  });

  beforeEach(() => limpiarCorreos());

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  it('RF-21a: emails one link with every pending week of the supervisor and audits it', async () => {
    const supervisor = await crearSupervisor({ institucionId, datos: { correo: 'jefa@empresa.com' } });
    const { expediente } = await alumnoDe(supervisor.id);
    const otro = await alumnoDe(supervisor.id);
    const semana = await crearSemana({ expedienteId: expediente.id, semanaInicio: '2026-11-02', estado: 'ENVIADA' });
    const delOtro = await crearSemana({ expedienteId: otro.expediente.id, semanaInicio: '2026-11-09', estado: 'ENVIADA' });
    await crearSemana({ expedienteId: expediente.id, semanaInicio: '2026-10-26', estado: 'VALIDADA' });

    const res = await enviar(expediente.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ semanas: 2 });
    const correos = correosEnviados();
    expect(correos).toHaveLength(1);
    expect(correos[0]!.para).toBe('jefa@empresa.com');
    const enlace = await prisma.enlaceValidacion.findFirstOrThrow({ where: { supervisorId: supervisor.id }, include: { semanas: true } });
    expect(enlace.semanas.map((s) => s.semanaId).sort()).toEqual([semana.id, delOtro.id].sort());
    const auditoria = await prisma.auditLog.findMany({ where: { entidadId: expediente.id, accion: 'ENVIAR_ENLACE_VALIDACION' } });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]!.despues).toEqual({ supervisorId: supervisor.id, correo: 'jefa@empresa.com', semanas: 2 });
  });

  it('RF-21a: the Monday job skips a supervisor the office emailed in the last 12 hours', async () => {
    const supervisor = await crearSupervisor({ institucionId });
    const { expediente } = await alumnoDe(supervisor.id);
    await crearSemana({ expedienteId: expediente.id, semanaInicio: '2026-11-02', estado: 'ENVIADA' });

    expect((await enviar(expediente.id)).status).toBe(200);
    const resumen = await ejecutarResumenSemanal({ ahora: new Date() });

    expect(resumen.omitidos).toContain(supervisor.id);
    expect(correosEnviados()).toHaveLength(1);
  });

  it('RF-21: answers 409 when the student has no week waiting for the supervisor', async () => {
    const supervisor = await crearSupervisor({ institucionId });
    const { expediente } = await alumnoDe(supervisor.id);
    await crearSemana({ expedienteId: expediente.id, estado: 'VALIDADA' });

    const res = await enviar(expediente.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SIN_SEMANAS_POR_VALIDAR');
    expect(correosEnviados()).toHaveLength(0);
  });

  it('RF-21: answers 409 when the case file has no supervisor', async () => {
    const { expediente } = await alumnoDe(null);

    const res = await enviar(expediente.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SIN_SUPERVISOR');
  });

  it('answers 400 for an invalid id', async () => {
    const res = await enviar('no-es-uuid');
    expect(res.status).toBe(400);
  });

  it('answers 401 without a session', async () => {
    const { expediente } = await alumnoDe(null);
    expect((await enviar(expediente.id, null)).status).toBe(401);
  });

  it('answers 403 for a student and for the other office (RN-03b)', async () => {
    const supervisor = await crearSupervisor({ institucionId });
    const { usuario, expediente } = await alumnoDe(supervisor.id);
    await crearSemana({ expedienteId: expediente.id, estado: 'ENVIADA' });

    expect((await enviar(expediente.id, await iniciarSesion(app, usuario))).status).toBe(403);
    expect((await enviar(expediente.id, cookieServicio)).status).toBe(403);
    expect(correosEnviados()).toHaveLength(0);
  });
});
