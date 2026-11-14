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
import type { EstadoValidacion } from '../../generated/prisma/enums.js';
import { enviarEnlaceValidacion } from '../validacion/validacion.service.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;
const MOTIVO = 'El supervisor no responde al correo.';
const COMENTARIO = 'Faltan actividades de la semana.';

describe('POST /api/semanas/:id/validacion: vinculación en nombre del supervisor (RF-22, RN-03b)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let vinculacion: Awaited<ReturnType<typeof crearUsuario>>;
  let cookieVinculacion: string;
  let cookieOtraOficina: string;
  let cookieOtroPlantel: string;
  let contador = 0;

  const post = (id: string, cookie: string | null, body?: object) => {
    const req = request(app).post(`/api/semanas/${id}/validacion`).set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    return body === undefined ? req : req.send(body);
  };

  async function caso(estado: EstadoValidacion = 'ENVIADA') {
    contador++;
    const institucion = await crearInstitucion({ plantelId });
    const supervisor = await crearSupervisor({ institucionId: institucion.id });
    const usuario = await crearAlumnoPrecargado({ plantelId, matricula: `2531907888${String(contador).padStart(4, '0')}`, password: PASSWORD_PRUEBA });
    const expediente = await crearExpediente({
      alumnoId: usuario.alumno!.id,
      tipo: 'SERVICIO_SOCIAL',
      institucionId: institucion.id,
      datos: { supervisorId: supervisor.id },
    });
    const semana = await crearSemana({ expedienteId: expediente.id, semanaInicio: '2026-11-02', estado, minutos: [120] });
    return { usuario, supervisor, expediente, semana, cookieAlumno: await iniciarSesion(app, usuario) };
  }

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    vinculacion = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' });
    cookieVinculacion = await iniciarSesion(app, vinculacion);
    cookieOtraOficina = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
    cookieOtroPlantel = await iniciarSesion(app, await crearUsuario({ plantelId: otroPlantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
  });

  beforeEach(() => limpiarCorreos());

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  it('RF-22: valida una semana enviada en nombre del supervisor', async () => {
    const c = await caso();

    const res = await post(c.semana.id, cookieVinculacion, { accion: 'VALIDAR', motivo: MOTIVO });

    expect(res.status).toBe(200);
    expect(res.body.semana).toMatchObject({ id: c.semana.id, estado: 'VALIDADA', comentario: null });
    const semana = await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: c.semana.id } });
    expect(semana).toMatchObject({ estado: 'VALIDADA', validadoPor: vinculacion.id });
    expect(semana.validadoEn).toBeInstanceOf(Date);
  });

  it('RF-22: rechaza una semana enviada con comentario para el alumno', async () => {
    const c = await caso();

    const res = await post(c.semana.id, cookieVinculacion, { accion: 'RECHAZAR', motivo: MOTIVO, comentario: COMENTARIO });

    expect(res.status).toBe(200);
    expect(res.body.semana).toMatchObject({ estado: 'RECHAZADA', comentario: COMENTARIO });
    const semana = await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: c.semana.id } });
    expect(semana).toMatchObject({ estado: 'RECHAZADA', comentario: COMENTARIO, validadoPor: null, validadoEn: null });
    expect(semana.rechazadaEn).toBeInstanceOf(Date);
  });

  it('RF-22: cuerpo inválido responde 400 (sin motivo, rechazo sin comentario, validar con comentario)', async () => {
    const c = await caso();

    const sinMotivo = await post(c.semana.id, cookieVinculacion, { accion: 'VALIDAR' });
    const motivoVacio = await post(c.semana.id, cookieVinculacion, { accion: 'VALIDAR', motivo: '   ' });
    const sinComentario = await post(c.semana.id, cookieVinculacion, { accion: 'RECHAZAR', motivo: MOTIVO });
    const comentarioCorto = await post(c.semana.id, cookieVinculacion, { accion: 'RECHAZAR', motivo: MOTIVO, comentario: 'no' });
    const validarConComentario = await post(c.semana.id, cookieVinculacion, { accion: 'VALIDAR', motivo: MOTIVO, comentario: COMENTARIO });
    const accionInvalida = await post(c.semana.id, cookieVinculacion, { accion: 'BORRAR', motivo: MOTIVO });

    for (const res of [sinMotivo, motivoVacio, sinComentario, comentarioCorto, validarConComentario, accionInvalida]) {
      expect(res.status).toBe(400);
    }
    expect(JSON.stringify(sinMotivo.body.error.details)).toContain('Indica el motivo.');
    expect(JSON.stringify(sinComentario.body.error.details)).toContain('Escribe al menos 5 caracteres');
    expect((await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: c.semana.id } })).estado).toBe('ENVIADA');
  });

  it('responde 401 sin sesión', async () => {
    const c = await caso();
    const res = await post(c.semana.id, null, { accion: 'VALIDAR', motivo: MOTIVO });
    expect(res.status).toBe(401);
  });

  it('responde 403 si es el alumno', async () => {
    const c = await caso();
    const res = await post(c.semana.id, c.cookieAlumno, { accion: 'VALIDAR', motivo: MOTIVO });
    expect(res.status).toBe(403);
  });

  it('RN-03b: otra oficina recibe 403 y otro plantel 404', async () => {
    const c = await caso();

    const otraOficina = await post(c.semana.id, cookieOtraOficina, { accion: 'VALIDAR', motivo: MOTIVO });
    const otroPlantel = await post(c.semana.id, cookieOtroPlantel, { accion: 'VALIDAR', motivo: MOTIVO });

    expect(otraOficina.status).toBe(403);
    expect(otroPlantel.status).toBe(404);
    expect((await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: c.semana.id } })).estado).toBe('ENVIADA');
  });

  it('responde 404 si la semana no existe', async () => {
    const res = await post('00000000-0000-4000-8000-000000000000', cookieVinculacion, { accion: 'VALIDAR', motivo: MOTIVO });
    expect(res.status).toBe(404);
  });

  it('RF-22: solo se resuelve una semana enviada; cualquier otro estado responde 409', async () => {
    for (const estado of ['BORRADOR', 'VALIDADA', 'RECHAZADA'] as const) {
      const c = await caso(estado);
      const res = await post(c.semana.id, cookieVinculacion, { accion: 'VALIDAR', motivo: MOTIVO });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SEMANA_NO_ENVIADA');
      expect((await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: c.semana.id } })).estado).toBe(estado);
    }
  });

  it('RF-29: registra la auditoría con el motivo y que fue en nombre del supervisor', async () => {
    const validada = await caso();
    const rechazada = await caso();

    await post(validada.semana.id, cookieVinculacion, { accion: 'VALIDAR', motivo: MOTIVO });
    await post(rechazada.semana.id, cookieVinculacion, { accion: 'RECHAZAR', motivo: MOTIVO, comentario: COMENTARIO });

    const a = await prisma.auditLog.findFirstOrThrow({ where: { entidadId: validada.semana.id } });
    expect(a).toMatchObject({
      usuarioId: vinculacion.id,
      accion: 'VALIDAR_SEMANA_VINCULACION',
      entidad: 'SemanaBitacora',
      antes: { estado: 'ENVIADA' },
      despues: { estado: 'VALIDADA', motivo: MOTIVO, enNombreDelSupervisor: true },
    });
    const b = await prisma.auditLog.findFirstOrThrow({ where: { entidadId: rechazada.semana.id } });
    expect(b).toMatchObject({
      accion: 'RECHAZAR_SEMANA_VINCULACION',
      despues: { estado: 'RECHAZADA', motivo: MOTIVO, comentario: COMENTARIO, enNombreDelSupervisor: true },
    });
  });

  it('RF-22: el enlace del supervisor muestra la semana ya resuelta y no permite actuar de nuevo', async () => {
    const c = await caso();
    await enviarEnlaceValidacion(c.supervisor.id, [c.semana.id]);
    const token = /\/validar\/([A-Za-z0-9_-]+)/.exec(correosEnviados().at(-1)!.texto)![1]!;

    await post(c.semana.id, cookieVinculacion, { accion: 'VALIDAR', motivo: MOTIVO });

    const enlace = await request(app).get(`/api/validacion/${token}`);
    expect(enlace.status).toBe(200);
    expect(enlace.body.enlace.semanas[0]).toMatchObject({ id: c.semana.id, estado: 'VALIDADA' });

    const intento = await request(app)
      .post(`/api/validacion/${token}`)
      .send({ decisiones: [{ semanaId: c.semana.id, accion: 'RECHAZAR', comentario: 'Rechazo tardío del supervisor.' }] });
    expect(intento.status).toBe(200);
    expect(intento.body.resultados).toEqual([{ semanaId: c.semana.id, resultado: 'YA_RESUELTA' }]);
    expect(await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: c.semana.id } })).toMatchObject({
      estado: 'VALIDADA',
      validadoPor: vinculacion.id,
    });
  });
});
