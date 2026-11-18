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
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { correosEnviados, limpiarCorreos } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import { enviarEnlaceValidacion } from '../validacion/validacion.service.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;
const tokenDe = (texto: string) => /\/validar\/([A-Za-z0-9_-]+)/.exec(texto)![1]!;

// RF-09, RF-21: when the office fixes a supervisor's address, the links sent to the old one stop working and the
// pending weeks go right away to the new one.
describe('cambio de correo del supervisor (RF-09, RF-21)', () => {
  const app = createApp();
  let plantelId: string;
  let institucionId: string;
  let cookieVinculacion: string;
  let matricula = 25319063991000;

  const editar = (id: string, body: object) =>
    request(app).patch(`/api/supervisores/${id}`).set('Origin', ORIGIN).set('Cookie', cookieVinculacion).send(body);
  const abrirEnlace = (token: string) => request(app).get(`/api/validacion/${token}`).set('Origin', ORIGIN);

  // A supervisor with one student whose week is in `estado`, and the link already emailed for it.
  async function supervisorConEnlace({ estado = 'ENVIADA', expedienteEstado = 'EN_PROCESO' } = {}) {
    const supervisor = await crearSupervisor({ institucionId, datos: { correo: 'equivocado@empresa.com' } });
    const alumno = await crearAlumnoPrecargado({ plantelId, matricula: String(matricula++) });
    const expediente = await crearExpediente({
      alumnoId: alumno.alumno!.id,
      tipo: 'PRACTICAS',
      institucionId,
      datos: { supervisorId: supervisor.id },
    });
    const semana = await crearSemana({ expedienteId: expediente.id, semanaInicio: '2026-11-02', estado: 'ENVIADA' });
    await enviarEnlaceValidacion(supervisor.id, [semana.id]);
    const token = tokenDe(correosEnviados().at(-1)!.texto);
    await prisma.semanaBitacora.update({ where: { id: semana.id }, data: { estado: estado as 'ENVIADA' } });
    await prisma.expediente.update({ where: { id: expediente.id }, data: { estado: expedienteEstado as 'EN_PROCESO' } });
    limpiarCorreos();
    return { supervisor, semana, token };
  }

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    institucionId = (await crearInstitucion({ plantelId })).id;
    cookieVinculacion = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
  });

  beforeEach(() => limpiarCorreos());

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  it('RN-20: the link sent to the old address stops working once the address is fixed', async () => {
    const { supervisor, token } = await supervisorConEnlace();
    expect((await abrirEnlace(token)).status).toBe(200);

    const res = await editar(supervisor.id, { correo: 'correcto@empresa.com' });

    expect(res.status).toBe(200);
    const viejo = await abrirEnlace(token);
    expect(viejo.status).toBe(410);
    expect(viejo.body.error.code).toBe('ENLACE_VENCIDO');
  });

  it('RN-20: the pending weeks are emailed right away to the new address with a link that works', async () => {
    const { supervisor, semana } = await supervisorConEnlace();

    const res = await editar(supervisor.id, { correo: 'Correcto@Empresa.com' });

    expect(res.body.reenvio).toEqual({ semanas: 1, enviado: true });
    const correos = correosEnviados();
    expect(correos).toHaveLength(1);
    expect(correos[0]!.para).toBe('correcto@empresa.com');
    const nuevo = await abrirEnlace(tokenDe(correos[0]!.texto));
    expect(nuevo.status).toBe(200);
    const enlaces = await prisma.enlaceValidacion.findMany({ where: { supervisorId: supervisor.id }, include: { semanas: true } });
    expect(enlaces).toHaveLength(2);
    expect(enlaces.find((e) => e.expiraEn > new Date())!.semanas.map((s) => s.semanaId)).toEqual([semana.id]);
  });

  it('RN-20: with no pending weeks the old link stops working and no email is sent', async () => {
    const { supervisor, token } = await supervisorConEnlace({ estado: 'VALIDADA' });

    const res = await editar(supervisor.id, { correo: 'correcto@empresa.com' });

    expect(res.body.reenvio).toBeNull();
    expect((await abrirEnlace(token)).status).toBe(410);
    expect(correosEnviados()).toHaveLength(0);
  });

  it('RN-20: weeks of a cancelled case file are not emailed', async () => {
    const { supervisor } = await supervisorConEnlace({ expedienteEstado: 'CANCELADO' });

    await editar(supervisor.id, { correo: 'correcto@empresa.com' });

    expect(correosEnviados()).toHaveLength(0);
  });

  it('RN-20: editing other fields, or sending the same address, keeps the link and sends nothing', async () => {
    const { supervisor, token } = await supervisorConEnlace();

    const otroCampo = await editar(supervisor.id, { puesto: 'Director' });
    const mismoCorreo = await editar(supervisor.id, { correo: 'EQUIVOCADO@empresa.com' });

    expect(otroCampo.body.reenvio).toBeNull();
    expect(mismoCorreo.body.reenvio).toBeNull();
    expect((await abrirEnlace(token)).status).toBe(200);
    expect(correosEnviados()).toHaveLength(0);
  });
});
