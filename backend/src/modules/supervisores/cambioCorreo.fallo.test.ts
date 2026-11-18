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

describe('cambio de correo del supervisor cuando falla el envío', () => {
  const app = createApp();
  let plantelId: string;

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  it('RF-21: the address is saved and the old link revoked even if the new email fails; the weekly job retries', async () => {
    const institucion = await crearInstitucion({ plantelId });
    const supervisor = await crearSupervisor({ institucionId: institucion.id, datos: { correo: 'equivocado@empresa.com' } });
    const alumno = await crearAlumnoPrecargado({ plantelId, matricula: '25319063992001' });
    const expediente = await crearExpediente({ alumnoId: alumno.alumno!.id, tipo: 'PRACTICAS', institucionId: institucion.id, datos: { supervisorId: supervisor.id } });
    const semana = await crearSemana({ expedienteId: expediente.id, estado: 'ENVIADA' });
    const viejo = await prisma.enlaceValidacion.create({
      data: { supervisorId: supervisor.id, tokenHash: 'hash-viejo', expiraEn: new Date(Date.now() + 86_400_000), semanas: { create: [{ semanaId: semana.id }] } },
    });
    const cookie = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));

    const res = await request(app)
      .patch(`/api/supervisores/${supervisor.id}`)
      .set('Origin', process.env.FRONTEND_ORIGIN!)
      .set('Cookie', cookie)
      .send({ correo: 'correcto@empresa.com' });

    expect(res.status).toBe(200);
    expect(res.body.supervisor.correo).toBe('correcto@empresa.com');
    const fila = await prisma.enlaceValidacion.findUniqueOrThrow({ where: { id: viejo.id } });
    expect(fila.expiraEn.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await prisma.enlaceValidacion.count({ where: { supervisorId: supervisor.id } })).toBe(1);
    expect((await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: semana.id } })).estado).toBe('ENVIADA');
  });
});
