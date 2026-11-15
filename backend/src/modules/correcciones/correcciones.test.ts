import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EstadoAsistencia, EstadoValidacion } from '../../generated/prisma/enums.js';
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
// Thursday 2026-11-12. The shift under correction is on Tuesday 2026-11-10 (week of 2026-11-09).
const AHORA: [string, string] = ['2026-11-12', '10:00'];
const SEMANA = '2026-11-09';
const DIA = '2026-11-10';
const MOTIVO = 'Olvidé registrar mi salida al terminar el turno.';

const iso = (fecha: string, hora: string) => instanteLocal(fecha, hora).toISOString();

describe('correcciones de turno (RF-17)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let cookieVinculacion: string;
  let cookieOtroPlantel: string;
  let contador = 0;

  const llamar = async (metodo: 'get' | 'post', ruta: string, cookie: string | null, body?: object) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instanteLocal(...AHORA));
    const req = request(app)[metodo](ruta).set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    try {
      return await (body === undefined ? req : req.send(body));
    } finally {
      vi.useRealTimers();
    }
  };
  const solicitar = (asistenciaId: string, cookie: string | null, body: object) =>
    llamar('post', `/api/asistencias/${asistenciaId}/correcciones`, cookie, body);
  const propuesta = (salida = '14:00', entrada = '09:00') => ({
    entradaNueva: iso(DIA, entrada),
    salidaNueva: iso(DIA, salida),
    motivo: MOTIVO,
  });

  // A student with an EN_PROCESO case file and one INCOMPLETA shift (RN-08) on DIA.
  async function caso({
    estadoTurno = 'INCOMPLETA' as EstadoAsistencia,
    estadoSemana = 'BORRADOR' as EstadoValidacion,
    plantel = plantelId,
  } = {}) {
    contador++;
    const usuario = await crearAlumnoPrecargado({
      plantelId: plantel,
      matricula: `2531905888${String(contador).padStart(4, '0')}`,
      password: PASSWORD_PRUEBA,
    });
    const expediente = await crearExpediente({ alumnoId: usuario.alumno!.id });
    const semana = await crearSemana({ expedienteId: expediente.id, semanaInicio: SEMANA, estado: estadoSemana });
    const entrada = instanteLocal(DIA, '09:00');
    const turno =
      estadoTurno === 'ABIERTA'
        ? await crearAsistencia({ expedienteId: expediente.id, entrada, semanaId: semana.id })
        : await crearAsistencia({
            expedienteId: expediente.id,
            entrada,
            minutos: estadoTurno === 'INCOMPLETA' ? 899 : 20,
            estado: estadoTurno,
            minutosAcreditables: estadoTurno === 'INCOMPLETA' ? 0 : 20,
            semanaId: semana.id,
          });
    return { usuario, expediente, semana, turno, cookie: await iniciarSesion(app, usuario) };
  }

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    cookieVinculacion = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
    cookieOtroPlantel = await iniciarSesion(app, await crearUsuario({ plantelId: otroPlantelId, rol: 'ALUMNO', username: '25319058889999' }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  describe('POST /api/asistencias/:id/correcciones', () => {
    it('RF-17, RN-08: el alumno solicita corregir un turno INCOMPLETA y queda PENDIENTE sin tocar el turno', async () => {
      const c = await caso();

      const res = await solicitar(c.turno.id, c.cookie, propuesta());

      expect(res.status).toBe(201);
      expect(res.body.correccion).toMatchObject({
        asistenciaId: c.turno.id,
        entradaNueva: iso(DIA, '09:00'),
        salidaNueva: iso(DIA, '14:00'),
        motivo: MOTIVO,
        estado: 'PENDIENTE',
        comentario: null,
        resueltoEn: null,
      });
      const guardada = await prisma.solicitudCorreccion.findUniqueOrThrow({ where: { id: res.body.correccion.id } });
      expect(guardada).toMatchObject({ estado: 'PENDIENTE', resueltoPor: null });
      // The shift only changes when the office approves (task 0038).
      const turno = await prisma.asistencia.findUniqueOrThrow({ where: { id: c.turno.id } });
      expect(turno).toMatchObject({ estado: 'INCOMPLETA', minutosAcreditables: 0 });
    });

    it('RF-17: también se puede corregir un turno CERRADA, incluso en una semana RECHAZADA', async () => {
      const c = await caso({ estadoTurno: 'CERRADA', estadoSemana: 'RECHAZADA' });
      const res = await solicitar(c.turno.id, c.cookie, propuesta('13:00'));
      expect(res.status).toBe(201);
    });

    it('RF-17: el motivo se guarda sin espacios a los lados', async () => {
      const c = await caso();
      const res = await solicitar(c.turno.id, c.cookie, { ...propuesta(), motivo: `  ${MOTIVO}  ` });
      expect(res.status).toBe(201);
      expect(res.body.correccion.motivo).toBe(MOTIVO);
    });

    it('RF-17: un turno ABIERTA no se corrige', async () => {
      const c = await caso({ estadoTurno: 'ABIERTA' });
      const res = await solicitar(c.turno.id, c.cookie, propuesta());
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('TURNO_NO_CORREGIBLE');
    });

    it('RF-17: no se corrige un turno de una semana enviada o validada', async () => {
      for (const estadoSemana of ['ENVIADA', 'VALIDADA'] as const) {
        const c = await caso({ estadoSemana });
        const res = await solicitar(c.turno.id, c.cookie, propuesta());
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('SEMANA_NO_CORREGIBLE');
      }
    });

    it('RF-17: rechaza una entrada de otro día, una salida anterior a la entrada y una hora futura', async () => {
      const c = await caso();
      const casos: [object, string][] = [
        [{ ...propuesta(), entradaNueva: iso('2026-11-09', '22:00') }, 'ENTRADA_OTRO_DIA'],
        [propuesta('08:00'), 'SALIDA_ANTERIOR_A_ENTRADA'],
        [{ ...propuesta(), salidaNueva: iso('2026-11-12', '11:00') }, 'HORA_FUTURA'],
      ];
      for (const [body, code] of casos) {
        const res = await solicitar(c.turno.id, c.cookie, body);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe(code);
        expect(res.body.error.message).toEqual(expect.any(String));
      }
      expect(await prisma.solicitudCorreccion.count({ where: { asistenciaId: c.turno.id } })).toBe(0);
    });

    it('RF-17: no se encima con otro turno del alumno', async () => {
      // A CERRADA 09:00-09:20 shift and a later one; an INCOMPLETA shift would already span until 23:59.
      const c = await caso({ estadoTurno: 'CERRADA' });
      await crearAsistencia({ expedienteId: c.expediente.id, entrada: instanteLocal(DIA, '15:00'), minutos: 60, semanaId: c.semana.id });

      const res = await solicitar(c.turno.id, c.cookie, propuesta('15:30'));

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASISTENCIA_TRASLAPADA');
    });

    it('RF-17: solo una solicitud pendiente por turno', async () => {
      const c = await caso();
      expect((await solicitar(c.turno.id, c.cookie, propuesta())).status).toBe(201);

      const res = await solicitar(c.turno.id, c.cookie, propuesta('15:00'));

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CORRECCION_PENDIENTE_EXISTENTE');
    });

    it('400: rechaza datos faltantes, fechas inválidas, motivo corto o largo, campos extra y un id inválido', async () => {
      const c = await caso();
      const invalidos = [
        {},
        { ...propuesta(), entradaNueva: undefined },
        { ...propuesta(), salidaNueva: '2026-11-10 14:00' },
        { ...propuesta(), motivo: 'corto' },
        { ...propuesta(), motivo: 'a'.repeat(501) },
        { ...propuesta(), otro: 1 },
      ];
      for (const body of invalidos) {
        const res = await solicitar(c.turno.id, c.cookie, body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect((await solicitar('no-es-uuid', c.cookie, propuesta())).status).toBe(400);
    });

    it('401: sin sesión', async () => {
      const c = await caso();
      const res = await solicitar(c.turno.id, null, propuesta());
      expect(res.status).toBe(401);
    });

    it('403: vinculación no solicita correcciones y un alumno no corrige el turno de otro', async () => {
      const c = await caso();
      const otro = await caso();
      expect((await solicitar(c.turno.id, cookieVinculacion, propuesta())).status).toBe(403);
      expect((await solicitar(c.turno.id, otro.cookie, propuesta())).status).toBe(403);
    });

    it('404: un turno inexistente o de otro plantel', async () => {
      const c = await caso();
      expect((await solicitar(randomUUID(), c.cookie, propuesta())).status).toBe(404);
      expect((await solicitar(c.turno.id, cookieOtroPlantel, propuesta())).status).toBe(404);
    });
  });

  describe('GET /api/asistencias (historial con correcciones)', () => {
    const turnoDelHistorial = async (cookie: string, expedienteId?: string) => {
      const query = expedienteId ? `?semana=${SEMANA}&expedienteId=${expedienteId}` : `?semana=${SEMANA}`;
      const res = await llamar('get', `/api/asistencias${query}`, cookie);
      expect(res.status).toBe(200);
      return res.body.semana.dias[1].turnos[0];
    };

    it('RF-17, RF-19: cada turno dice si el alumno puede solicitar corrección y trae la última solicitud', async () => {
      const c = await caso();
      expect(await turnoDelHistorial(c.cookie)).toMatchObject({ puedeSolicitarCorreccion: true, correccion: null });

      await solicitar(c.turno.id, c.cookie, propuesta());

      expect(await turnoDelHistorial(c.cookie)).toMatchObject({
        puedeSolicitarCorreccion: false,
        correccion: { estado: 'PENDIENTE', salidaNueva: iso(DIA, '14:00'), motivo: MOTIVO, comentario: null },
      });
    });

    it('RF-17: no se ofrece corregir en una semana enviada ni a vinculación', async () => {
      const enviada = await caso({ estadoSemana: 'ENVIADA' });
      expect(await turnoDelHistorial(enviada.cookie)).toMatchObject({ puedeSolicitarCorreccion: false });

      const c = await caso();
      expect(await turnoDelHistorial(cookieVinculacion, c.expediente.id)).toMatchObject({ puedeSolicitarCorreccion: false });
    });
  });
});
