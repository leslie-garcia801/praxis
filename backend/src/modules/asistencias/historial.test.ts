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
import { instanteLocal } from '../../lib/tiempo.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;
// Wednesday; its week goes from Monday 2026-11-09 to Sunday 2026-11-15.
const HOY = '2026-11-11';

describe('GET /api/asistencias (RF-19)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let cookiePracticas: string;
  let cookieServicio: string;
  let cookieAdmin: string;
  let cookieOtroPlantel: string;
  let contador = 0;

  // Only Date is faked: the database and sockets keep working.
  const pedir = async (consulta: string, cookie: string | null) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instanteLocal(HOY, '12:00'));
    const req = request(app).get(`/api/asistencias${consulta}`).set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    try {
      return await req;
    } finally {
      vi.useRealTimers();
    }
  };

  async function caso({
    tipo = 'PRACTICAS' as TipoPrograma,
    estado = 'EN_PROCESO' as EstadoExpediente,
    usuario: existente,
  }: { tipo?: TipoPrograma; estado?: EstadoExpediente; usuario?: Awaited<ReturnType<typeof crearAlumnoPrecargado>> } = {}) {
    const usuario =
      existente ??
      (await crearAlumnoPrecargado({
        plantelId,
        matricula: `2531905499${String(++contador).padStart(4, '0')}`,
        password: PASSWORD_PRUEBA,
      }));
    const expediente = await crearExpediente({ alumnoId: usuario.alumno!.id, tipo, estado });
    return { usuario, id: expediente.id, cookie: () => iniciarSesion(app, usuario) };
  }

  const turno = (expedienteId: string, dia: string, hhmm: string, minutos: number, extra: Partial<Parameters<typeof crearAsistencia>[0]> = {}) =>
    crearAsistencia({ expedienteId, entrada: instanteLocal(dia, hhmm), minutos, ...extra });

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

  describe('caso feliz', () => {
    it('RF-19: arma los 7 días de la semana (lunes a domingo) con sus turnos y totales', async () => {
      const c = await caso();
      const lunes = await turno(c.id, '2026-11-09', '09:00', 120);
      const miercoles = await turno(c.id, '2026-11-11', '10:00', 90, { sinConexion: true });
      const abierto = await crearAsistencia({ expedienteId: c.id, entrada: instanteLocal('2026-11-12', '08:00') });
      await turno(c.id, '2026-11-02', '09:00', 60); // semana anterior

      const res = await pedir(`?semana=${HOY}`, await c.cookie());

      expect(res.status).toBe(200);
      const { semana } = res.body;
      expect(semana).toMatchObject({ inicio: '2026-11-09', fin: '2026-11-15', estadoValidacion: null });
      expect(semana.dias.map((d: { fecha: string }) => d.fecha)).toEqual([
        '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
      ]);
      expect(semana.dias[0]).toEqual({
        fecha: '2026-11-09',
        turnos: [
          {
            id: lunes.id,
            entrada: instanteLocal('2026-11-09', '09:00').toISOString(),
            salida: instanteLocal('2026-11-09', '11:00').toISOString(),
            estado: 'CERRADA',
            minutosAcreditables: 120,
            sinConexion: false,
          },
        ],
        minutosDia: 120,
        minutosAcreditablesDia: 120,
      });
      expect(semana.dias[1]).toEqual({ fecha: '2026-11-10', turnos: [], minutosDia: 0, minutosAcreditablesDia: 0 });
      expect(semana.dias[2].turnos).toMatchObject([{ id: miercoles.id, sinConexion: true, minutosAcreditables: 90 }]);
      expect(semana.dias[3].turnos).toMatchObject([{ id: abierto.id, estado: 'ABIERTA', salida: null, minutosAcreditables: null }]);
      expect(semana.dias[3]).toMatchObject({ minutosDia: 0, minutosAcreditablesDia: 0 });
      expect(semana.totales).toEqual({ minutos: 210, minutosAcreditables: 210 });
    });

    it('sin semana usa la semana actual y cualquier fecha se normaliza a su lunes', async () => {
      const c = await caso();
      await turno(c.id, '2026-11-10', '09:00', 60);
      await turno(c.id, '2026-11-16', '09:00', 60); // semana siguiente: no cuenta
      const cookie = await c.cookie();

      const actual = await pedir('', cookie);
      expect(actual.body.semana.inicio).toBe('2026-11-09');
      expect(actual.body.semana.totales.minutos).toBe(60);

      const domingo = await pedir('?semana=2026-11-15', cookie);
      expect(domingo.body.semana.inicio).toBe('2026-11-09');
      expect(domingo.body.semana.totales.minutos).toBe(60);

      const otra = await pedir('?semana=2026-11-02', cookie);
      expect(otra.body.semana).toMatchObject({ inicio: '2026-11-02', fin: '2026-11-08' });
      expect(otra.body.semana.totales.minutos).toBe(0);
    });

    it('RN-04: el historial muestra el excedente pero acredita máximo 300 min', async () => {
      const c = await caso();
      await turno(c.id, '2026-11-10', '08:00', 200, { minutosAcreditables: 200 });
      await turno(c.id, '2026-11-10', '13:00', 200, { minutosAcreditables: 100 });

      const res = await pedir(`?semana=${HOY}`, await c.cookie());

      const martes = res.body.semana.dias[1];
      expect(martes.minutosDia).toBe(400);
      expect(martes.minutosAcreditablesDia).toBe(300);
      expect(martes.turnos.map((t: { minutosAcreditables: number }) => t.minutosAcreditables)).toEqual([200, 100]);
      expect(res.body.semana.totales).toEqual({ minutos: 400, minutosAcreditables: 300 });
    });

    it('RN-09: un turno de menos de 15 minutos no suma', async () => {
      const c = await caso();
      await turno(c.id, '2026-11-10', '08:00', 10, { minutosAcreditables: 0 });

      const res = await pedir(`?semana=${HOY}`, await c.cookie());

      expect(res.body.semana.dias[1]).toMatchObject({ minutosDia: 0, minutosAcreditablesDia: 0 });
      expect(res.body.semana.dias[1].turnos).toHaveLength(1);
    });

    it('RN-15: agrupa por el día local de la entrada (domingo 22:00 en Monterrey ya es lunes en UTC)', async () => {
      const c = await caso();
      await turno(c.id, '2026-11-15', '22:00', 30);
      await turno(c.id, '2026-11-09', '00:30', 30);

      const res = await pedir(`?semana=${HOY}`, await c.cookie());

      expect(res.body.semana.dias[6].turnos).toHaveLength(1);
      expect(res.body.semana.dias[0].turnos).toHaveLength(1);
    });

    it('RF-19: estadoValidacion refleja la semana de bitácora cuando existe', async () => {
      const c = await caso();
      await crearSemana({ expedienteId: c.id, semanaInicio: '2026-11-09', estado: 'ENVIADA' });

      const res = await pedir(`?semana=${HOY}`, await c.cookie());

      expect(res.body.semana.estadoValidacion).toBe('ENVIADA');
    });

    describe('bitácora de la semana (RF-20)', () => {
      const ENVIO = new Date('2026-11-10T15:00:00.000Z');

      it('sin SemanaBitacora: id null, bitácora vacía y sin permiso para editar ni enviar', async () => {
        const c = await caso();
        const res = await pedir(`?semana=${HOY}`, await c.cookie());
        expect(res.body.semana).toMatchObject({
          id: null,
          actividades: null,
          comentario: null,
          enviadaEn: null,
          puedeEditar: false,
          puedeEnviar: false,
        });
      });

      it('semana en curso en borrador: se edita pero aún no se envía', async () => {
        const c = await caso();
        const s = await crearSemana({ expedienteId: c.id, semanaInicio: '2026-11-09', estado: 'BORRADOR' });
        await prisma.semanaBitacora.update({ where: { id: s.id }, data: { actividades: 'Archivo de oficios' } });

        const res = await pedir(`?semana=${HOY}`, await c.cookie());

        expect(res.body.semana).toMatchObject({
          id: s.id,
          estadoValidacion: 'BORRADOR',
          actividades: 'Archivo de oficios',
          enviadaEn: null,
          puedeEditar: true,
          puedeEnviar: false,
        });
      });

      it('semana cerrada en borrador de un expediente en proceso se puede enviar', async () => {
        const c = await caso();
        const s = await crearSemana({ expedienteId: c.id, semanaInicio: '2026-11-02', estado: 'BORRADOR' });

        const res = await pedir('?semana=2026-11-02', await c.cookie());

        expect(res.body.semana).toMatchObject({ id: s.id, puedeEditar: true, puedeEnviar: true });
      });

      it('un expediente finalizado edita pero no envía', async () => {
        const c = await caso({ estado: 'FINALIZADO' });
        await crearSemana({ expedienteId: c.id, semanaInicio: '2026-11-02', estado: 'BORRADOR' });

        const res = await pedir('?semana=2026-11-02', await c.cookie());

        expect(res.body.semana).toMatchObject({ puedeEditar: true, puedeEnviar: false });
      });

      it('RECHAZADA: muestra el comentario del supervisor y vuelve a ser editable y enviable', async () => {
        const c = await caso();
        const s = await crearSemana({ expedienteId: c.id, semanaInicio: '2026-11-02', estado: 'RECHAZADA' });
        await prisma.semanaBitacora.update({ where: { id: s.id }, data: { comentario: 'Detalla las actividades.', enviadaEn: ENVIO } });

        const res = await pedir('?semana=2026-11-02', await c.cookie());

        expect(res.body.semana).toMatchObject({
          comentario: 'Detalla las actividades.',
          enviadaEn: ENVIO.toISOString(),
          puedeEditar: true,
          puedeEnviar: true,
        });
      });

      it('ENVIADA o VALIDADA: no se edita ni se envía, y el comentario solo sale si está rechazada', async () => {
        for (const estado of ['ENVIADA', 'VALIDADA'] as const) {
          const c = await caso();
          const s = await crearSemana({ expedienteId: c.id, semanaInicio: '2026-11-02', estado });
          await prisma.semanaBitacora.update({ where: { id: s.id }, data: { comentario: 'Comentario viejo', enviadaEn: ENVIO } });

          const res = await pedir('?semana=2026-11-02', await c.cookie());

          expect(res.body.semana).toMatchObject({
            estadoValidacion: estado,
            comentario: null,
            enviadaEn: ENVIO.toISOString(),
            puedeEditar: false,
            puedeEnviar: false,
          });
        }
      });

      it('la oficina ve la bitácora pero no puede editarla ni enviarla (solo la escribe el alumno)', async () => {
        const c = await caso();
        const s = await crearSemana({ expedienteId: c.id, semanaInicio: '2026-11-02', estado: 'BORRADOR' });

        const res = await pedir('?semana=2026-11-02&expedienteId=' + c.id, cookiePracticas);

        expect(res.body.semana).toMatchObject({ id: s.id, puedeEditar: false, puedeEnviar: false });
      });
    });
  });

  describe('expediente del alumno', () => {
    it('por defecto usa el expediente activo, no uno cancelado más reciente', async () => {
      const c = await caso();
      await turno(c.id, '2026-11-10', '09:00', 60);
      await caso({ usuario: c.usuario, estado: 'CANCELADO', tipo: 'SERVICIO_SOCIAL' });

      const res = await pedir(`?semana=${HOY}`, await c.cookie());

      expect(res.status).toBe(200);
      expect(res.body.semana.totales.minutos).toBe(60);
    });

    it('sin expediente activo usa el más reciente de cualquier estado', async () => {
      const c = await caso({ estado: 'FINALIZADO' });
      await turno(c.id, '2026-11-10', '09:00', 45);

      const res = await pedir(`?semana=${HOY}`, await c.cookie());

      expect(res.status).toBe(200);
      expect(res.body.semana.totales.minutos).toBe(45);
    });

    it('un alumno sin expedientes recibe 404', async () => {
      const usuario = await crearAlumnoPrecargado({
        plantelId,
        matricula: `2531905499${String(++contador).padStart(4, '0')}`,
        password: PASSWORD_PRUEBA,
      });
      const res = await pedir('', await iniciarSesion(app, usuario));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('EXPEDIENTE_NO_ENCONTRADO');
    });

    it('puede indicar su propio expedienteId (por ejemplo uno anterior)', async () => {
      const c = await caso({ estado: 'CANCELADO' });
      await turno(c.id, '2026-11-10', '09:00', 75);
      await caso({ usuario: c.usuario, tipo: 'SERVICIO_SOCIAL' });

      const res = await pedir(`?semana=${HOY}&expedienteId=${c.id}`, await c.cookie());

      expect(res.status).toBe(200);
      expect(res.body.semana.totales.minutos).toBe(75);
    });

    it('un expedienteId de otro alumno responde 403', async () => {
      const a = await caso();
      const b = await caso();
      const res = await pedir(`?expedienteId=${a.id}`, await b.cookie());
      expect(res.status).toBe(403);
    });
  });

  describe('vinculación y admin', () => {
    it('el expedienteId es obligatorio (400)', async () => {
      const res = await pedir('', cookiePracticas);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('RN-03b: la oficina del expediente y admin ven el historial', async () => {
      const c = await caso();
      await turno(c.id, '2026-11-10', '09:00', 60);
      for (const cookie of [cookiePracticas, cookieAdmin]) {
        const res = await pedir(`?semana=${HOY}&expedienteId=${c.id}`, cookie);
        expect(res.status).toBe(200);
        expect(res.body.semana.totales.minutos).toBe(60);
      }
    });

    it('RN-03b: vinculación de otra oficina recibe 403', async () => {
      const c = await caso({ tipo: 'PRACTICAS' });
      const res = await pedir(`?expedienteId=${c.id}`, cookieServicio);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('un expediente de otro plantel responde 404', async () => {
      const c = await caso();
      const res = await pedir(`?expedienteId=${c.id}`, cookieOtroPlantel);
      expect(res.status).toBe(404);
    });
  });

  describe('validación y sesión', () => {
    it('sin sesión responde 401', async () => {
      const res = await pedir('', null);
      expect(res.status).toBe(401);
    });

    it('una semana con formato inválido responde 400', async () => {
      const c = await caso();
      const res = await pedir('?semana=11-11-2026', await c.cookie());
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('un expedienteId inválido responde 400', async () => {
      const res = await pedir('?expedienteId=no-es-uuid', cookieAdmin);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
