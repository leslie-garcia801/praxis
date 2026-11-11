import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EstadoExpediente, EstadoValidacion } from '../../generated/prisma/enums.js';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearExpediente,
  crearPlantel,
  crearSemana,
  crearUsuario,
  iniciarSesion,
  PASSWORD_PRUEBA,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { instanteLocal } from '../../lib/tiempo.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;
// Wednesday 2026-11-11: the week of 2026-11-02 is closed; the week of 2026-11-09 is in progress.
const HOY = '2026-11-11';
const SEMANA_CERRADA = '2026-11-02';
const SEMANA_EN_CURSO = '2026-11-09';
const TEXTO_VALIDO = 'Apoyé en la captura de expedientes y en la atención al público durante toda la semana.';

describe('semanas de bitácora (RF-20, RN-17)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let cookieVinculacion: string;
  let cookieOtroPlantel: string;
  let contador = 0;

  // Only Date is faked: the database and sockets keep working.
  const llamar = async (
    metodo: 'put' | 'post',
    ruta: string,
    cookie: string | null,
    body?: object,
    momento: [string, string] = [HOY, '12:00'],
  ) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instanteLocal(...momento));
    const req = request(app)[metodo](ruta).set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    try {
      return await (body === undefined ? req : req.send(body));
    } finally {
      vi.useRealTimers();
    }
  };
  const guardar = (id: string, cookie: string | null, body?: object, momento?: [string, string]) =>
    llamar('put', `/api/semanas/${id}/bitacora`, cookie, body, momento);
  const enviar = (id: string, cookie: string | null, momento?: [string, string]) =>
    llamar('post', `/api/semanas/${id}/enviar`, cookie, undefined, momento);

  async function caso({
    semanaInicio = SEMANA_CERRADA,
    estado = 'BORRADOR' as EstadoValidacion,
    expediente: estadoExpediente = 'EN_PROCESO' as EstadoExpediente,
    actividades = null as string | null,
    comentario = null as string | null,
    plantel = plantelId,
  } = {}) {
    contador++;
    const usuario = await crearAlumnoPrecargado({
      plantelId: plantel,
      matricula: `2531905777${String(contador).padStart(4, '0')}`,
      password: PASSWORD_PRUEBA,
    });
    const expediente = await crearExpediente({ alumnoId: usuario.alumno!.id, estado: estadoExpediente });
    const semana = await crearSemana({ expedienteId: expediente.id, semanaInicio, estado });
    if (actividades !== null || comentario !== null) {
      await prisma.semanaBitacora.update({ where: { id: semana.id }, data: { actividades, comentario } });
    }
    return { usuario, expediente, semana, cookie: await iniciarSesion(app, usuario) };
  }

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    cookieVinculacion = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
    cookieOtroPlantel = await iniciarSesion(app, await crearUsuario({ plantelId: otroPlantelId, rol: 'ALUMNO', username: '25319059990001' }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  describe('PUT /api/semanas/:id/bitacora', () => {
    it('RF-20: guarda la bitácora como borrador aunque tenga menos de 50 caracteres', async () => {
      const c = await caso({ semanaInicio: SEMANA_EN_CURSO });

      const res = await guardar(c.semana.id, c.cookie, { actividades: 'Archivo.' });

      expect(res.status).toBe(200);
      expect(res.body.semana).toMatchObject({ id: c.semana.id, estado: 'BORRADOR', actividades: 'Archivo.', enviadaEn: null });
      expect(res.body.semana.bitacoraActualizadaEn).toBe(instanteLocal(HOY, '12:00').toISOString());
      const guardada = await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: c.semana.id } });
      expect(guardada.actividades).toBe('Archivo.');
      expect(guardada.bitacoraActualizadaEn).toEqual(instanteLocal(HOY, '12:00'));
    });

    it('RF-20: la bitácora no se edita después de enviarla ni de validarla', async () => {
      for (const estado of ['ENVIADA', 'VALIDADA'] as const) {
        const c = await caso({ estado, actividades: TEXTO_VALIDO });
        const res = await guardar(c.semana.id, c.cookie, { actividades: 'Otro texto' });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('SEMANA_NO_EDITABLE');
        const sinCambios = await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: c.semana.id } });
        expect(sinCambios.actividades).toBe(TEXTO_VALIDO);
      }
    });

    it('RF-20: se vuelve a editar tras ser rechazada y conserva el estado RECHAZADA', async () => {
      const c = await caso({ estado: 'RECHAZADA', actividades: 'Texto viejo', comentario: 'Detalla más.' });

      const res = await guardar(c.semana.id, c.cookie, { actividades: TEXTO_VALIDO });

      expect(res.status).toBe(200);
      expect(res.body.semana).toMatchObject({ estado: 'RECHAZADA', actividades: TEXTO_VALIDO });
    });

    it('acepta una bitácora vacía y de exactamente 5000 caracteres', async () => {
      const c = await caso();
      expect((await guardar(c.semana.id, c.cookie, { actividades: '' })).status).toBe(200);
      expect((await guardar(c.semana.id, c.cookie, { actividades: 'a'.repeat(5000) })).status).toBe(200);
    });

    it('400: rechaza actividades ausentes, de otro tipo o de más de 5000 caracteres y un id inválido', async () => {
      const c = await caso();
      for (const body of [{}, { actividades: 5 }, { actividades: 'a'.repeat(5001) }, { actividades: 'x', otro: 1 }]) {
        const res = await guardar(c.semana.id, c.cookie, body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      const id = await guardar('no-es-uuid', c.cookie, { actividades: 'x' });
      expect(id.status).toBe(400);
      expect(id.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('401: sin sesión', async () => {
      const c = await caso();
      expect((await guardar(c.semana.id, null, { actividades: 'x' })).status).toBe(401);
    });

    it('403: vinculación no escribe la bitácora', async () => {
      const c = await caso();
      const res = await guardar(c.semana.id, cookieVinculacion, { actividades: 'x' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('403: otro alumno del mismo plantel', async () => {
      const a = await caso();
      const b = await caso();
      const res = await guardar(a.semana.id, b.cookie, { actividades: 'x' });
      expect(res.status).toBe(403);
    });

    it('404: semana de otro plantel e id inexistente', async () => {
      const c = await caso();
      expect((await guardar(c.semana.id, cookieOtroPlantel, { actividades: 'x' })).status).toBe(404);
      expect((await guardar(randomUUID(), c.cookie, { actividades: 'x' })).status).toBe(404);
    });
  });

  describe('POST /api/semanas/:id/enviar', () => {
    it('RF-20: una semana cerrada con bitácora válida pasa a ENVIADA con enviadaEn y auditoría', async () => {
      const c = await caso({ actividades: TEXTO_VALIDO });

      const res = await enviar(c.semana.id, c.cookie);

      expect(res.status).toBe(200);
      expect(res.body.semana).toMatchObject({ id: c.semana.id, estado: 'ENVIADA', actividades: TEXTO_VALIDO });
      expect(res.body.semana.enviadaEn).toBe(instanteLocal(HOY, '12:00').toISOString());
      const guardada = await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: c.semana.id } });
      expect(guardada.estado).toBe('ENVIADA');
      expect(guardada.enviadaEn).toEqual(instanteLocal(HOY, '12:00'));
      const auditoria = await prisma.auditLog.findMany({ where: { entidad: 'SemanaBitacora', entidadId: c.semana.id } });
      expect(auditoria).toHaveLength(1);
      expect(auditoria[0]).toMatchObject({
        accion: 'ENVIAR_SEMANA',
        usuarioId: c.usuario.id,
        antes: { estado: 'BORRADOR' },
        despues: { estado: 'ENVIADA', enviadaEn: instanteLocal(HOY, '12:00').toISOString() },
      });
    });

    it('RF-20: una semana rechazada y corregida se reenvía', async () => {
      const c = await caso({ estado: 'RECHAZADA', actividades: TEXTO_VALIDO, comentario: 'Falta detalle.' });
      const res = await enviar(c.semana.id, c.cookie);
      expect(res.status).toBe(200);
      expect(res.body.semana.estado).toBe('ENVIADA');
      const auditoria = await prisma.auditLog.findFirstOrThrow({ where: { entidadId: c.semana.id } });
      expect(auditoria.antes).toEqual({ estado: 'RECHAZADA' });
    });

    it('RN-17: no se envía una semana sin bitácora de 50 caracteres', async () => {
      const sinTexto = await caso();
      const corto = await caso({ actividades: 'Texto corto' });
      // 49 characters once the surrounding spaces are removed.
      const conEspacios = await caso({ actividades: `   ${'a'.repeat(49)}   ` });
      for (const c of [sinTexto, corto, conEspacios]) {
        const res = await enviar(c.semana.id, c.cookie);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('BITACORA_INCOMPLETA');
        const intacta = await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: c.semana.id } });
        expect(intacta.estado).toBe('BORRADOR');
        expect(await prisma.auditLog.count({ where: { entidadId: c.semana.id } })).toBe(0);
      }
    });

    it('RN-17: exactamente 50 caracteres sin contar espacios de los extremos sí se envía', async () => {
      const c = await caso({ actividades: `  ${'a'.repeat(50)}  ` });
      expect((await enviar(c.semana.id, c.cookie)).status).toBe(200);
    });

    it('RN-15: una semana en curso no se envía; el lunes a las 00:00 en Monterrey ya está cerrada', async () => {
      const c = await caso({ semanaInicio: SEMANA_EN_CURSO, actividades: TEXTO_VALIDO });

      const enCurso = await enviar(c.semana.id, c.cookie);
      expect(enCurso.status).toBe(409);
      expect(enCurso.body.error.code).toBe('SEMANA_EN_CURSO');

      const domingoNoche = await enviar(c.semana.id, c.cookie, ['2026-11-15', '23:30']);
      expect(domingoNoche.status).toBe(409);
      expect(domingoNoche.body.error.code).toBe('SEMANA_EN_CURSO');

      const lunes = await enviar(c.semana.id, c.cookie, ['2026-11-16', '00:00']);
      expect(lunes.status).toBe(200);
    });

    it('409 SEMANA_NO_EDITABLE: ya enviada o validada', async () => {
      for (const estado of ['ENVIADA', 'VALIDADA'] as const) {
        const c = await caso({ estado, actividades: TEXTO_VALIDO });
        const res = await enviar(c.semana.id, c.cookie);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('SEMANA_NO_EDITABLE');
      }
    });

    it('un expediente suspendido puede enviar; uno finalizado o pendiente no', async () => {
      const suspendido = await caso({ expediente: 'SUSPENDIDO', actividades: TEXTO_VALIDO });
      expect((await enviar(suspendido.semana.id, suspendido.cookie)).status).toBe(200);

      for (const estado of ['FINALIZADO', 'PENDIENTE', 'CANCELADO'] as const) {
        const c = await caso({ expediente: estado, actividades: TEXTO_VALIDO });
        const res = await enviar(c.semana.id, c.cookie);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('EXPEDIENTE_NO_ACTIVO');
      }
    });

    it('400: id inválido', async () => {
      const c = await caso();
      const res = await enviar('no-es-uuid', c.cookie);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('401: sin sesión', async () => {
      const c = await caso({ actividades: TEXTO_VALIDO });
      expect((await enviar(c.semana.id, null)).status).toBe(401);
    });

    it('403: vinculación y otro alumno', async () => {
      const a = await caso({ actividades: TEXTO_VALIDO });
      const b = await caso();
      expect((await enviar(a.semana.id, cookieVinculacion)).status).toBe(403);
      expect((await enviar(a.semana.id, b.cookie)).status).toBe(403);
      const intacta = await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: a.semana.id } });
      expect(intacta.estado).toBe('BORRADOR');
    });

    it('404: semana de otro plantel e id inexistente', async () => {
      const c = await caso({ actividades: TEXTO_VALIDO });
      expect((await enviar(c.semana.id, cookieOtroPlantel)).status).toBe(404);
      expect((await enviar(randomUUID(), c.cookie)).status).toBe(404);
    });
  });
});
