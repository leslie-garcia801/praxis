import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EstadoAsistencia, TipoPrograma } from '../../generated/prisma/enums.js';
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
const AHORA: [string, string] = ['2026-11-12', '10:00'];
const SEMANA = '2026-11-09';
const DIA = '2026-11-10';
const MOTIVO = 'Olvidé registrar mi salida al terminar el turno.';
const COMENTARIO = 'Tu supervisor confirma que saliste a las 13:00.';

describe('resolución de correcciones (RF-17, RF-29, RN-03b)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let cookieServicio: string;
  let cookiePracticas: string;
  let cookieAdmin: string;
  let cookieOtroPlantel: string;
  let servicioId: string;
  let contador = 0;

  const llamar = async (metodo: 'get' | 'patch' | 'post', ruta: string, cookie: string | null, body?: object) => {
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
  const resolver = (id: string, cookie: string | null, body: object) => llamar('patch', `/api/correcciones/${id}`, cookie, body);
  const listar = (cookie: string | null, query = '') => llamar('get', `/api/correcciones${query}`, cookie);
  const aprobar = { accion: 'APROBAR' };
  const rechazar = { accion: 'RECHAZAR', comentario: COMENTARIO };

  // A student with one shift on DIA and a PENDIENTE request to change it to `entrada`-`salida`.
  async function caso({
    tipo = 'SERVICIO_SOCIAL' as TipoPrograma,
    estadoTurno = 'INCOMPLETA' as EstadoAsistencia,
    entrada = '09:00',
    salida = '14:00',
  } = {}) {
    contador++;
    const usuario = await crearAlumnoPrecargado({
      plantelId,
      matricula: `2531905999${String(contador).padStart(4, '0')}`,
      password: PASSWORD_PRUEBA,
    });
    const expediente = await crearExpediente({ alumnoId: usuario.alumno!.id, tipo });
    const semana = await crearSemana({ expedienteId: expediente.id, semanaInicio: SEMANA, estado: 'BORRADOR' });
    const incompleta = estadoTurno === 'INCOMPLETA';
    const turno = await crearAsistencia({
      expedienteId: expediente.id,
      entrada: instanteLocal(DIA, '09:00'),
      minutos: incompleta ? 899 : 20,
      estado: estadoTurno,
      minutosAcreditables: incompleta ? 0 : 20,
      semanaId: semana.id,
    });
    const solicitud = await prisma.solicitudCorreccion.create({
      data: {
        asistenciaId: turno.id,
        entradaNueva: instanteLocal(DIA, entrada),
        salidaNueva: instanteLocal(DIA, salida),
        motivo: MOTIVO,
        creadoEn: instanteLocal('2026-11-11', `1${contador % 10}:00`),
      },
    });
    return { usuario, expediente, semana, turno, solicitud, cookie: () => iniciarSesion(app, usuario) };
  }

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    const servicio = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' });
    servicioId = servicio.id;
    cookieServicio = await iniciarSesion(app, servicio);
    cookiePracticas = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
    cookieAdmin = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ADMIN' }));
    cookieOtroPlantel = await iniciarSesion(app, await crearUsuario({ plantelId: otroPlantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  describe('PATCH /api/correcciones/:id', () => {
    it('RF-17, RN-08, RF-29: al aprobar, el turno INCOMPLETA queda CERRADA con las horas nuevas, se acredita y se audita', async () => {
      const c = await caso();

      const res = await resolver(c.solicitud.id, cookieServicio, aprobar);

      expect(res.status).toBe(200);
      expect(res.body.correccion).toMatchObject({
        id: c.solicitud.id,
        estado: 'APROBADA',
        comentario: null,
        resueltoEn: instanteLocal(...AHORA).toISOString(),
      });
      const turno = await prisma.asistencia.findUniqueOrThrow({ where: { id: c.turno.id } });
      expect(turno).toMatchObject({
        entrada: instanteLocal(DIA, '09:00'),
        salida: instanteLocal(DIA, '14:00'),
        estado: 'CERRADA',
        minutosAcreditables: 300,
      });
      const solicitud = await prisma.solicitudCorreccion.findUniqueOrThrow({ where: { id: c.solicitud.id } });
      expect(solicitud.resueltoPor).toBe(servicioId);

      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entidad: 'Asistencia', entidadId: c.turno.id } });
      expect(audit).toMatchObject({ usuarioId: servicioId, accion: 'CORREGIR_ASISTENCIA' });
      expect(audit.antes).toMatchObject({ estado: 'INCOMPLETA', minutosAcreditables: 0, salida: instanteLocal(DIA, '23:59').toISOString() });
      expect(audit.despues).toMatchObject({
        estado: 'CERRADA',
        minutosAcreditables: 300,
        salida: instanteLocal(DIA, '14:00').toISOString(),
        solicitudId: c.solicitud.id,
      });
    });

    it('RN-04: al aprobar se recalcula el tope de 390 minutos con los demás turnos del día', async () => {
      // 09:00-09:20 corrected to 08:00-14:00 (360 min) plus a 15:00-16:00 shift (60 min): the later one keeps 30.
      const c = await caso({ estadoTurno: 'CERRADA', entrada: '08:00', salida: '14:00' });
      const tarde = await crearAsistencia({ expedienteId: c.expediente.id, entrada: instanteLocal(DIA, '15:00'), minutos: 60, semanaId: c.semana.id });

      expect((await resolver(c.solicitud.id, cookieServicio, aprobar)).status).toBe(200);

      expect((await prisma.asistencia.findUniqueOrThrow({ where: { id: c.turno.id } })).minutosAcreditables).toBe(360);
      expect((await prisma.asistencia.findUniqueOrThrow({ where: { id: tarde.id } })).minutosAcreditables).toBe(30);
    });

    it('RF-17, RF-29: al rechazar, el turno no cambia, se guarda el comentario y se audita', async () => {
      const c = await caso();

      const res = await resolver(c.solicitud.id, cookieAdmin, { ...rechazar, comentario: `  ${COMENTARIO}  ` });

      expect(res.status).toBe(200);
      expect(res.body.correccion).toMatchObject({ estado: 'RECHAZADA', comentario: COMENTARIO });
      const turno = await prisma.asistencia.findUniqueOrThrow({ where: { id: c.turno.id } });
      expect(turno).toMatchObject({ estado: 'INCOMPLETA', minutosAcreditables: 0 });
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entidad: 'SolicitudCorreccion', entidadId: c.solicitud.id } });
      expect(audit).toMatchObject({ accion: 'RECHAZAR_CORRECCION', despues: { estado: 'RECHAZADA', comentario: COMENTARIO } });
    });

    it('RF-17: tras un rechazo el alumno puede volver a solicitar', async () => {
      const c = await caso();
      await resolver(c.solicitud.id, cookieServicio, rechazar);

      const res = await llamar('post', `/api/asistencias/${c.turno.id}/correcciones`, await c.cookie(), {
        entradaNueva: instanteLocal(DIA, '09:00').toISOString(),
        salidaNueva: instanteLocal(DIA, '13:00').toISOString(),
        motivo: MOTIVO,
      });

      expect(res.status).toBe(201);
    });

    it('RF-17: una solicitud ya resuelta no se vuelve a resolver', async () => {
      const c = await caso();
      await resolver(c.solicitud.id, cookieServicio, aprobar);

      for (const body of [aprobar, rechazar]) {
        const res = await resolver(c.solicitud.id, cookieServicio, body);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('CORRECCION_NO_PENDIENTE');
      }
    });

    it('RF-17: no se aprueba si la semana ya se envió, pero sí se puede rechazar', async () => {
      const c = await caso();
      await prisma.semanaBitacora.update({ where: { id: c.semana.id }, data: { estado: 'ENVIADA' } });

      const res = await resolver(c.solicitud.id, cookieServicio, aprobar);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SEMANA_NO_CORREGIBLE');
      expect((await prisma.asistencia.findUniqueOrThrow({ where: { id: c.turno.id } })).estado).toBe('INCOMPLETA');

      expect((await resolver(c.solicitud.id, cookieServicio, rechazar)).status).toBe(200);
    });

    it('RF-17: no se aprueba si las horas ya se traslapan con un turno registrado después de la solicitud', async () => {
      const c = await caso({ estadoTurno: 'CERRADA', salida: '16:00' });
      await crearAsistencia({ expedienteId: c.expediente.id, entrada: instanteLocal(DIA, '15:00'), minutos: 60, semanaId: c.semana.id });

      const res = await resolver(c.solicitud.id, cookieServicio, aprobar);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASISTENCIA_TRASLAPADA');
      expect((await prisma.solicitudCorreccion.findUniqueOrThrow({ where: { id: c.solicitud.id } })).estado).toBe('PENDIENTE');
    });

    it('400: acción inválida, rechazo sin comentario, aprobación con comentario, campos extra e id inválido', async () => {
      const c = await caso();
      for (const body of [{}, { accion: 'BORRAR' }, { accion: 'RECHAZAR' }, { accion: 'RECHAZAR', comentario: 'no' }, { ...aprobar, comentario: COMENTARIO }, { ...aprobar, otro: 1 }]) {
        const res = await resolver(c.solicitud.id, cookieServicio, body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect((await resolver('no-es-uuid', cookieServicio, aprobar)).status).toBe(400);
    });

    it('401: sin sesión', async () => {
      const c = await caso();
      expect((await resolver(c.solicitud.id, null, aprobar)).status).toBe(401);
    });

    it('403: el alumno no resuelve y otra oficina tampoco (RN-03b)', async () => {
      const c = await caso();
      expect((await resolver(c.solicitud.id, await c.cookie(), aprobar)).status).toBe(403);
      expect((await resolver(c.solicitud.id, cookiePracticas, aprobar)).status).toBe(403);
      expect((await prisma.solicitudCorreccion.findUniqueOrThrow({ where: { id: c.solicitud.id } })).estado).toBe('PENDIENTE');
    });

    it('404: una solicitud inexistente o de otro plantel', async () => {
      const c = await caso();
      expect((await resolver(randomUUID(), cookieServicio, aprobar)).status).toBe(404);
      expect((await resolver(c.solicitud.id, cookieOtroPlantel, aprobar)).status).toBe(404);
    });
  });

  describe('GET /api/correcciones', () => {
    it('RF-17, RN-03b: cada oficina ve las pendientes de su oficina, las más antiguas primero, con el alumno y el turno', async () => {
      const servicio = await caso();
      const practicas = await caso({ tipo: 'PRACTICAS' });

      const res = await listar(cookieServicio);

      expect(res.status).toBe(200);
      const ids = res.body.correcciones.map((x: { id: string }) => x.id);
      expect(ids).toContain(servicio.solicitud.id);
      expect(ids).not.toContain(practicas.solicitud.id);
      const fila = res.body.correcciones.find((x: { id: string }) => x.id === servicio.solicitud.id);
      expect(fila).toMatchObject({
        estado: 'PENDIENTE',
        motivo: MOTIVO,
        turno: { id: servicio.turno.id, estado: 'INCOMPLETA', minutosAcreditables: 0 },
        expediente: { id: servicio.expediente.id, tipo: 'SERVICIO_SOCIAL' },
        alumno: { matricula: servicio.usuario.username },
      });
      const fechas = res.body.correcciones.map((x: { creadoEn: string }) => x.creadoEn);
      expect(fechas).toEqual([...fechas].sort());

      const admin = await listar(cookieAdmin);
      expect(admin.body.correcciones.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([servicio.solicitud.id, practicas.solicitud.id]));
      expect((await listar(cookieOtroPlantel)).body.correcciones).toEqual([]);
    });

    it('RF-17: por defecto solo pendientes; ?estado filtra las resueltas', async () => {
      const c = await caso();
      await resolver(c.solicitud.id, cookieServicio, rechazar);

      expect((await listar(cookieServicio)).body.correcciones.map((x: { id: string }) => x.id)).not.toContain(c.solicitud.id);
      const rechazadas = await listar(cookieServicio, '?estado=RECHAZADA');
      expect(rechazadas.body.correcciones.map((x: { id: string }) => x.id)).toContain(c.solicitud.id);
    });

    it('RF-17, RF-18: el alumno ve solo las suyas, de cualquier estado', async () => {
      const c = await caso();
      const otro = await caso();
      await resolver(c.solicitud.id, cookieServicio, rechazar);

      const res = await listar(await c.cookie());

      expect(res.status).toBe(200);
      expect(res.body.correcciones).toHaveLength(1);
      expect(res.body.correcciones[0]).toMatchObject({ id: c.solicitud.id, estado: 'RECHAZADA', comentario: COMENTARIO });
      expect(res.body.correcciones.map((x: { id: string }) => x.id)).not.toContain(otro.solicitud.id);
    });

    it('400: estado inválido; 401: sin sesión', async () => {
      expect((await listar(cookieServicio, '?estado=OTRO')).status).toBe(400);
      expect((await listar(null)).status).toBe(401);
    });
  });

  describe('auditoría del expediente (RF-25, RF-29)', () => {
    it('RF-29: incluye la corrección aprobada del turno y el rechazo de una solicitud', async () => {
      const aprobada = await caso();
      await resolver(aprobada.solicitud.id, cookieServicio, aprobar);
      const segunda = await prisma.solicitudCorreccion.create({
        data: { asistenciaId: aprobada.turno.id, entradaNueva: instanteLocal(DIA, '09:00'), salidaNueva: instanteLocal(DIA, '12:00'), motivo: MOTIVO },
      });
      await resolver(segunda.id, cookieServicio, rechazar);

      const res = await llamar('get', `/api/expedientes/${aprobada.expediente.id}/auditoria`, cookieServicio);

      expect(res.status).toBe(200);
      const acciones = res.body.entradas.map((e: { accion: string }) => e.accion);
      expect(acciones).toEqual(expect.arrayContaining(['CORREGIR_ASISTENCIA', 'RECHAZAR_CORRECCION']));
    });
  });
});
