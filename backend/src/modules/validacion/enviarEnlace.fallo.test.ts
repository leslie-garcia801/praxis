import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { borrarPlantel, crearAlumnoPrecargado, crearExpediente, crearInstitucion, crearPlantel, crearSemana, crearSupervisor } from '../../../test/factories.js';
import { prisma } from '../../lib/prisma.js';

vi.mock('../../lib/mailer.js', () => ({
  enviarCorreo: vi.fn().mockRejectedValue(new Error('Resend caído')),
}));

const { enviarEnlaceValidacion } = await import('./validacion.service.js');

describe('enviarEnlaceValidacion cuando falla el envío', () => {
  let plantelId: string;

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  it('RF-21: si el correo no sale, el error se propaga y no queda el enlace creado', async () => {
    const institucion = await crearInstitucion({ plantelId });
    const supervisor = await crearSupervisor({ institucionId: institucion.id });
    const alumno = await crearAlumnoPrecargado({ plantelId, matricula: '25319063990001' });
    const expediente = await crearExpediente({ alumnoId: alumno.alumno!.id, tipo: 'PRACTICAS', institucionId: institucion.id, datos: { supervisorId: supervisor.id } });
    const semana = await crearSemana({ expedienteId: expediente.id, estado: 'ENVIADA' });

    await expect(enviarEnlaceValidacion(supervisor.id, [semana.id])).rejects.toThrow('Resend caído');

    expect(await prisma.enlaceValidacion.count({ where: { supervisorId: supervisor.id } })).toBe(0);
    expect(await prisma.enlaceValidacionSemana.count({ where: { semanaId: semana.id } })).toBe(0);
  });
});
