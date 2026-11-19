import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
} from '../../../test/factories.js';
import { prisma } from '../../lib/prisma.js';

vi.mock('../../lib/mailer.js', () => ({
  enviarCorreo: vi.fn().mockRejectedValue(new Error('Resend caído')),
}));

const { createApp } = await import('../../app.js');

describe('POST /api/expedientes/:id/enlace-validacion cuando falla el envío', () => {
  const app = createApp();
  let plantelId: string;

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  it('RF-21: answers 502 and stores no link or audit entry when the email fails', async () => {
    const institucion = await crearInstitucion({ plantelId });
    const supervisor = await crearSupervisor({ institucionId: institucion.id });
    const alumno = await crearAlumnoPrecargado({ plantelId, matricula: '25319064002001' });
    const expediente = await crearExpediente({ alumnoId: alumno.alumno!.id, tipo: 'PRACTICAS', institucionId: institucion.id, datos: { supervisorId: supervisor.id } });
    await crearSemana({ expedienteId: expediente.id, estado: 'ENVIADA' });
    const cookie = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .post(`/api/expedientes/${expediente.id}/enlace-validacion`)
      .set('Origin', process.env.FRONTEND_ORIGIN!)
      .set('Cookie', cookie);

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('CORREO_NO_ENVIADO');
    expect(await prisma.enlaceValidacion.count({ where: { supervisorId: supervisor.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entidadId: expediente.id, accion: 'ENVIAR_ENLACE_VALIDACION' } })).toBe(0);
  });
});
