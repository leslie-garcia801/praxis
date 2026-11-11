import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EstadoExpediente, TipoPrograma } from '../../generated/prisma/enums.js';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearExpediente,
  crearInstitucion,
  crearPlantel,
  crearUsuario,
  iniciarSesion,
  PASSWORD_PRUEBA,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { generarCredencialesQr } from '../../domain/qrInstitucion.js';
import { prisma } from '../../lib/prisma.js';
import { fechaLocal, instanteLocal, sumarDias } from '../../lib/tiempo.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

// Local calendar days around the real "today", so sessions (opened with the real clock) stay valid
// while the fake clock moves within a couple of days.
const HOY = fechaLocal(new Date());
const AYER = sumarDias(HOY, -1);
const MANANA = sumarDias(HOY, 1);

describe('POST /api/asistencias/escaneo (RF-14, RF-15)', () => {
  const app = createApp();
  let plantelId: string;
  let cookieVinculacion: string;
  let contador = 0;

  // Only Date is faked: timers, sockets and the database keep working.
  const fijarHora = (dia: string, hhmm: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instanteLocal(dia, hhmm));
  };

  const escanear = async (cookie: string | null, body: object, momento?: [string, string]) => {
    if (momento) fijarHora(...momento);
    const req = request(app).post('/api/asistencias/escaneo').set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    try {
      return await req.send(body);
    } finally {
      vi.useRealTimers();
    }
  };

  // A student with an active case file at an institution that has its own QR.
  async function caso({
    estado = 'EN_PROCESO',
    tipo = 'SERVICIO_SOCIAL',
    fechaInicio = sumarDias(HOY, -30),
    fechaTermino = null as string | null,
  }: { estado?: EstadoExpediente; tipo?: TipoPrograma; fechaInicio?: string; fechaTermino?: string | null } = {}) {
    contador++;
    const credenciales = generarCredencialesQr();
    const institucion = await crearInstitucion({
      plantelId,
      datos: { qrTokenHash: credenciales.qrTokenHash, codigoCorto: credenciales.codigoCorto },
    });
    const usuario = await crearAlumnoPrecargado({
      plantelId,
      matricula: `2531905298${String(contador).padStart(4, '0')}`,
      password: PASSWORD_PRUEBA,
    });
    const expediente = await crearExpediente({
      alumnoId: usuario.alumno!.id,
      tipo,
      estado,
      institucionId: institucion.id,
      datos: {
        fechaInicio: new Date(`${fechaInicio}T00:00:00.000Z`),
        fechaTermino: fechaTermino ? new Date(`${fechaTermino}T00:00:00.000Z`) : null,
      },
    });
    const cookie = await iniciarSesion(app, usuario);
    return { usuario, expediente, institucion, cookie, token: credenciales.token, codigo: credenciales.codigoCorto };
  }

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    cookieVinculacion = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  describe('caso feliz', () => {
    it('RF-14: registra la entrada con el token y después la salida (201 y 200)', async () => {
      const a = await caso();
      const entrada = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      expect(entrada.status).toBe(201);
      expect(entrada.body).toMatchObject({
        tipo: 'ENTRADA',
        asistencia: { estado: 'ABIERTA', salida: null, sinConexion: false },
        minutosDia: 0,
        minutosAcreditablesDia: 0,
        excedente: 0,
      });
      expect(entrada.body.asistencia.entrada).toBe(instanteLocal(HOY, '08:00').toISOString());

      const salida = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '10:00']);
      expect(salida.status).toBe(200);
      expect(salida.body).toMatchObject({
        tipo: 'SALIDA',
        asistencia: { id: entrada.body.asistencia.id, estado: 'CERRADA', minutosAcreditables: 120 },
        minutosDia: 120,
        minutosAcreditablesDia: 120,
        excedente: 0,
      });
      expect(salida.body.asistencia.salida).toBe(instanteLocal(HOY, '10:00').toISOString());
    });

    it('RF-15: registra entrada y salida con el código corto (acepta minúsculas)', async () => {
      const a = await caso();
      const entrada = await escanear(a.cookie, { id: randomUUID(), codigoCorto: a.codigo.toLowerCase() }, [HOY, '09:00']);
      expect(entrada.status).toBe(201);
      const salida = await escanear(a.cookie, { id: randomUUID(), codigoCorto: a.codigo }, [HOY, '11:00']);
      expect(salida.body).toMatchObject({ tipo: 'SALIDA', minutosDia: 120 });
    });

    it('permite registrar prácticas profesionales', async () => {
      const a = await caso({ tipo: 'PRACTICAS' });
      const res = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      expect(res.status).toBe(201);
    });
  });

  describe('validación y acceso', () => {
    it('devuelve 400 con un cuerpo inválido', async () => {
      const a = await caso();
      const id = randomUUID();
      const invalidos = [
        {},
        { id: 'no-es-uuid', token: a.token },
        { id, token: a.token, codigoCorto: a.codigo },
        { id },
        { id, token: a.token, sinConexion: 'si' },
        { id, token: a.token, sinConexion: true },
        { id, token: a.token, hora: 'ayer' },
        { id, token: a.token, extra: 1 },
      ];
      for (const body of invalidos) {
        const res = await escanear(a.cookie, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('devuelve 401 sin sesión', async () => {
      const res = await escanear(null, { id: randomUUID(), token: 'x' });
      expect(res.status).toBe(401);
    });

    it('devuelve 403 si el rol no es ALUMNO', async () => {
      const res = await escanear(cookieVinculacion, { id: randomUUID(), token: 'x' });
      expect(res.status).toBe(403);
    });

    it('devuelve 404 si el token o el código no existen', async () => {
      const a = await caso();
      const porToken = await escanear(a.cookie, { id: randomUUID(), token: 'token-desconocido' });
      expect(porToken.status).toBe(404);
      expect(porToken.body.error.code).toBe('QR_NO_ENCONTRADO');
      const porCodigo = await escanear(a.cookie, { id: randomUUID(), codigoCorto: 'ZZZZZZ' });
      expect(porCodigo.status).toBe(404);
      expect(await prisma.asistencia.count({ where: { expedienteId: a.expediente.id } })).toBe(0);
    });
  });

  describe('expediente', () => {
    it('RN-10: rechaza un QR de otra institución', async () => {
      const a = await caso();
      const otra = await caso();
      const res = await escanear(a.cookie, { id: randomUUID(), token: otra.token }, [HOY, '08:00']);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('QR_DE_OTRA_INSTITUCION');
      expect(await prisma.asistencia.count({ where: { expedienteId: a.expediente.id } })).toBe(0);
    });

    it('RN-13: rechaza el escaneo de un expediente SUSPENDIDO', async () => {
      const a = await caso({ estado: 'SUSPENDIDO' });
      const res = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EXPEDIENTE_SUSPENDIDO');
      expect(await prisma.asistencia.count({ where: { expedienteId: a.expediente.id } })).toBe(0);
    });

    it('rechaza un expediente PENDIENTE, FINALIZADO o CANCELADO', async () => {
      for (const estado of ['PENDIENTE', 'FINALIZADO', 'CANCELADO'] as const) {
        const a = await caso({ estado });
        const res = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
        expect(res.status, estado).toBe(409);
        expect(res.body.error.code).toBe('EXPEDIENTE_NO_ACTIVO');
      }
    });

    it('rechaza el escaneo antes de la fecha de inicio y no guarda nada', async () => {
      const a = await caso({ fechaInicio: MANANA });
      const res = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ANTES_DE_FECHA_INICIO');
      expect(await prisma.asistencia.count({ where: { expedienteId: a.expediente.id } })).toBe(0);
    });

    it('acepta el escaneo el mismo día de inicio', async () => {
      const a = await caso({ fechaInicio: HOY });
      const res = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      expect(res.status).toBe(201);
    });

    it('acepta prácticas después de fechaTermino mientras el expediente siga en proceso', async () => {
      const a = await caso({ tipo: 'PRACTICAS', fechaInicio: sumarDias(HOY, -90), fechaTermino: sumarDias(HOY, -5) });
      const res = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      expect(res.status).toBe(201);
    });
  });

  describe('hora (RN-14, RN-15)', () => {
    it('RN-14: con conexión usa la hora del servidor e ignora la del dispositivo', async () => {
      const a = await caso();
      const res = await escanear(a.cookie, { id: randomUUID(), token: a.token, hora: '2020-01-01T00:00:00.000Z', sinConexion: false }, [HOY, '08:00']);
      expect(res.status).toBe(201);
      expect(res.body.asistencia.entrada).toBe(instanteLocal(HOY, '08:00').toISOString());
    });

    it('RN-14: sin conexión usa la hora del dispositivo y la marca como sin conexión', async () => {
      const a = await caso();
      const hora = instanteLocal(HOY, '07:30').toISOString();
      const res = await escanear(a.cookie, { id: randomUUID(), token: a.token, hora, sinConexion: true }, [HOY, '08:00']);
      expect(res.status).toBe(201);
      expect(res.body.asistencia).toMatchObject({ entrada: hora, sinConexion: true });
    });

    it('RN-14: rechaza un registro sin conexión de más de 72 horas', async () => {
      const a = await caso();
      const hora = new Date(instanteLocal(HOY, '08:00').getTime() - 72 * 3_600_000 - 60_000).toISOString();
      const res = await escanear(a.cookie, { id: randomUUID(), token: a.token, hora, sinConexion: true }, [HOY, '08:00']);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('HORA_ANTIGUA');
      expect(await prisma.asistencia.count({ where: { expedienteId: a.expediente.id } })).toBe(0);
    });

    it('RN-14: rechaza una hora del dispositivo en el futuro (más de 5 minutos)', async () => {
      const a = await caso();
      const hora = new Date(instanteLocal(HOY, '08:00').getTime() + 6 * 60_000).toISOString();
      const res = await escanear(a.cookie, { id: randomUUID(), token: a.token, hora, sinConexion: true }, [HOY, '08:00']);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('HORA_FUTURA');
    });

    it('RN-14: acepta un registro sin conexión de casi 72 horas', async () => {
      const a = await caso();
      const hora = new Date(instanteLocal(HOY, '08:00').getTime() - 71 * 3_600_000).toISOString();
      const res = await escanear(a.cookie, { id: randomUUID(), token: a.token, hora, sinConexion: true }, [HOY, '08:00']);
      expect(res.status).toBe(201);
    });
  });

  describe('turnos y horas acreditables', () => {
    it('RN-04: acredita máximo 300 minutos por día y reporta el excedente', async () => {
      const a = await caso();
      await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '07:00']);
      const salida = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '14:00']);
      expect(salida.body).toMatchObject({
        tipo: 'SALIDA',
        asistencia: { minutosAcreditables: 300 },
        minutosDia: 420,
        minutosAcreditablesDia: 300,
        excedente: 120,
      });
    });

    it('RN-04: el tope se reparte entre varios turnos del mismo día y se guarda por turno', async () => {
      const a = await caso();
      const dos = async (de: string, a2: string) => {
        await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, de]);
        return escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, a2]);
      };
      const primero = await dos('06:00', '09:00'); // 180
      const segundo = await dos('10:00', '14:00'); // 240 -> only 120 credited
      expect(primero.body.asistencia.minutosAcreditables).toBe(180);
      expect(segundo.body).toMatchObject({ minutosDia: 420, minutosAcreditablesDia: 300, excedente: 120 });
      expect(segundo.body.asistencia.minutosAcreditables).toBe(120);
      const guardados = await prisma.asistencia.findMany({ where: { expedienteId: a.expediente.id }, orderBy: { entrada: 'asc' } });
      expect(guardados.map((g) => g.minutosAcreditables)).toEqual([180, 120]);
    });

    it('RN-09: un turno de menos de 15 minutos se cierra pero no acredita nada', async () => {
      const a = await caso();
      await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      const salida = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:14']);
      expect(salida.status).toBe(200);
      expect(salida.body).toMatchObject({
        tipo: 'SALIDA',
        asistencia: { estado: 'CERRADA', minutosAcreditables: 0 },
        minutosDia: 0,
        minutosAcreditablesDia: 0,
      });
    });

    it('RN-09: un turno de exactamente 15 minutos sí acredita', async () => {
      const a = await caso();
      await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      const salida = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:15']);
      expect(salida.body.asistencia.minutosAcreditables).toBe(15);
    });

    it('RN-07: nunca hay dos turnos abiertos; el segundo escaneo cierra el primero', async () => {
      const a = await caso();
      await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      const segundo = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '09:00']);
      expect(segundo.body.tipo).toBe('SALIDA');
      expect(await prisma.asistencia.count({ where: { expedienteId: a.expediente.id, estado: 'ABIERTA' } })).toBe(0);
    });

    it('RN-07: dos entradas simultáneas con ids distintos responden 409 y no 500', async () => {
      const a = await caso();
      fijarHora(HOY, '08:00');
      const pedir = () =>
        request(app).post('/api/asistencias/escaneo').set('Origin', ORIGIN).set('Cookie', a.cookie).send({ id: randomUUID(), token: a.token });
      const respuestas = await Promise.all([pedir(), pedir()]);
      vi.useRealTimers();
      const estados = respuestas.map((r) => r.status).sort();
      expect(estados.every((s) => s < 500)).toBe(true);
      expect(await prisma.asistencia.count({ where: { expedienteId: a.expediente.id, estado: 'ABIERTA' } })).toBeLessThanOrEqual(1);
    });

    it('RN-08: un turno abierto de un día anterior se cierra INCOMPLETA y el escaneo registra una entrada nueva', async () => {
      const a = await caso();
      const vieja = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [AYER, '08:00']);
      const res = await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      expect(res.status).toBe(201);
      expect(res.body.tipo).toBe('ENTRADA');
      expect(res.body.asistencia.id).not.toBe(vieja.body.asistencia.id);

      const anterior = await prisma.asistencia.findUniqueOrThrow({ where: { id: vieja.body.asistencia.id } });
      expect(anterior).toMatchObject({ estado: 'INCOMPLETA', minutosAcreditables: 0 });
      expect(anterior.salida!.toISOString()).toBe(instanteLocal(AYER, '23:59').toISOString());
      expect(await prisma.asistencia.count({ where: { expedienteId: a.expediente.id, estado: 'ABIERTA' } })).toBe(1);
    });

    it('rechaza con 409 un escaneo sin conexión anterior a la entrada del turno abierto', async () => {
      const a = await caso();
      await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      const hora = instanteLocal(HOY, '07:00').toISOString();
      const res = await escanear(a.cookie, { id: randomUUID(), token: a.token, hora, sinConexion: true }, [HOY, '08:30']);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ESCANEO_ANTERIOR_AL_TURNO');
    });

    it('responde 409 y no 500 cuando una entrada sin conexión se traslapa con un turno ya cerrado', async () => {
      const a = await caso();
      await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '10:00']);
      const hora = instanteLocal(HOY, '09:00').toISOString();
      const res = await escanear(a.cookie, { id: randomUUID(), token: a.token, hora, sinConexion: true }, [HOY, '10:30']);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASISTENCIA_TRASLAPADA');
    });
  });

  describe('idempotencia', () => {
    it('responde 200 con el registro existente cuando llega el mismo id dos veces', async () => {
      const a = await caso();
      const id = randomUUID();
      const primera = await escanear(a.cookie, { id, token: a.token }, [HOY, '08:00']);
      expect(primera.status).toBe(201);
      const repetida = await escanear(a.cookie, { id, token: a.token }, [HOY, '08:05']);
      expect(repetida.status).toBe(200);
      expect(repetida.body).toEqual({ ...primera.body });
      expect(await prisma.asistencia.count({ where: { expedienteId: a.expediente.id } })).toBe(1);
    });

    it('RN-14: un reenvío de la salida con el mismo id no crea una entrada nueva', async () => {
      const a = await caso();
      await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      const idSalida = randomUUID();
      const salida = await escanear(a.cookie, { id: idSalida, token: a.token }, [HOY, '10:00']);
      expect(salida.status).toBe(200);

      const repetida = await escanear(a.cookie, { id: idSalida, token: a.token }, [HOY, '10:05']);
      expect(repetida.status).toBe(200);
      expect(repetida.body).toEqual(salida.body);
      expect(repetida.body.tipo).toBe('SALIDA');

      const todas = await prisma.asistencia.findMany({ where: { expedienteId: a.expediente.id } });
      expect(todas).toHaveLength(1);
      expect(todas[0]).toMatchObject({ estado: 'CERRADA', salidaId: idSalida });
    });

    it('responde 409 si el id de una salida pertenece a otro alumno', async () => {
      const a = await caso();
      const b = await caso();
      await escanear(a.cookie, { id: randomUUID(), token: a.token }, [HOY, '08:00']);
      const idSalida = randomUUID();
      await escanear(a.cookie, { id: idSalida, token: a.token }, [HOY, '10:00']);
      const res = await escanear(b.cookie, { id: idSalida, token: b.token }, [HOY, '10:05']);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASISTENCIA_ID_EN_USO');
      expect(await prisma.asistencia.count({ where: { expedienteId: b.expediente.id } })).toBe(0);
    });

    it('reenviar el id de la entrada con el turno abierto es una repetición, no una salida', async () => {
      const a = await caso();
      const idEntrada = randomUUID();
      await escanear(a.cookie, { id: idEntrada, token: a.token }, [HOY, '08:00']);
      const res = await escanear(a.cookie, { id: idEntrada, token: a.token }, [HOY, '10:00']);
      expect(res.status).toBe(200);
      expect(res.body.tipo).toBe('ENTRADA');
    });

    it('responde 409 si el id pertenece a otro alumno', async () => {
      const a = await caso();
      const b = await caso();
      const id = randomUUID();
      await escanear(a.cookie, { id, token: a.token }, [HOY, '08:00']);
      const res = await escanear(b.cookie, { id, token: b.token }, [HOY, '08:05']);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASISTENCIA_ID_EN_USO');
      expect(await prisma.asistencia.count({ where: { expedienteId: b.expediente.id } })).toBe(0);
    });
  });
});
