import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearAsistencia,
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
import { instanteLocal } from '../../lib/tiempo.js';
import { ejecutarResumenSemanal } from '../validacion/resumenSemanal.service.js';
import { enviarEnlaceValidacion } from '../validacion/validacion.service.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;
// Wednesday 2026-11-11: the weeks of 2026-10-26 and 2026-11-02 are closed; 2026-11-09 is in progress.
const HOY = '2026-11-11';
const SEMANA_A = '2026-10-26';
const SEMANA_B = '2026-11-02';
const SEMANA_EN_CURSO = '2026-11-09';
const COMENTARIO = 'Las horas del lunes no coinciden con la libreta.';

type Turno = { id: string; fecha: string; entrada: string; salida: string };
const turno = (fecha: string, entrada = '08:00', salida = '12:00'): Turno => ({ id: randomUUID(), fecha, entrada, salida });

describe('horas de libreta (RF-17a, RN-19)', () => {
  const app = createApp();
  let plantelId: string;
  let cookieVinculacion: string;
  let cookieAdmin: string;
  let contador = 0;

  // Only Date is faked: the database and sockets keep working.
  const llamar = async (metodo: 'put' | 'post' | 'get', ruta: string, cookie: string | null, body?: object, momento: [string, string] = [HOY, '12:00']) => {
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
  const registrar = (cookie: string | null, turnos: unknown, momento?: [string, string]) => llamar('post', '/api/semanas/libreta', cookie, { turnos }, momento);
  const corregir = (id: string, cookie: string | null, turnos: unknown) => llamar('put', `/api/semanas/${id}/libreta`, cookie, { turnos });

  async function caso({ estado = 'EN_PROCESO' as 'EN_PROCESO' | 'SUSPENDIDO' | 'PENDIENTE', conSupervisor = true, fechaInicio = '2026-10-01' } = {}) {
    contador++;
    const institucion = await crearInstitucion({ plantelId });
    const supervisor = await crearSupervisor({ institucionId: institucion.id });
    const usuario = await crearAlumnoPrecargado({ plantelId, matricula: `2531907777${String(contador).padStart(4, '0')}`, password: PASSWORD_PRUEBA });
    const expediente = await crearExpediente({
      alumnoId: usuario.alumno!.id,
      estado,
      institucionId: institucion.id,
      fechaInicio: new Date(`${fechaInicio}T00:00:00.000Z`),
      datos: { supervisorId: conSupervisor ? supervisor.id : null },
    });
    return { institucion, supervisor, usuario, expediente, cookie: await iniciarSesion(app, usuario) };
  }

  const semanaDe = (expedienteId: string, inicio: string) =>
    prisma.semanaBitacora.findUnique({ where: { expedienteId_semanaInicio: { expedienteId, semanaInicio: new Date(`${inicio}T00:00:00.000Z`) } }, include: { asistencias: { orderBy: { entrada: 'asc' } } } });

  // A libreta week already sent and then rejected by the supervisor.
  async function semanaRechazada(c: Awaited<ReturnType<typeof caso>>, inicio = SEMANA_B) {
    const res = await registrar(c.cookie, [turno(inicio, '08:00', '10:00')]);
    expect(res.status).toBe(201);
    const id = res.body.semanas[0].id as string;
    await prisma.semanaBitacora.update({ where: { id }, data: { estado: 'RECHAZADA', comentario: COMENTARIO, rechazadaEn: instanteLocal(HOY, '09:00') } });
    return id;
  }

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    cookieVinculacion = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
    cookieAdmin = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ADMIN' }));
  });

  beforeEach(() => limpiarCorreos());

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  describe('POST /api/semanas/libreta', () => {
    it('RF-17a: registra turnos de dos semanas cerradas y las envía al supervisor', async () => {
      const c = await caso();
      const turnos = [turno('2026-10-27'), turno('2026-10-28', '09:00', '11:30'), turno('2026-11-03', '08:00', '10:00')];

      const res = await registrar(c.cookie, turnos);

      expect(res.status).toBe(201);
      expect(res.body.semanas).toHaveLength(2);
      expect(res.body.semanas[0]).toMatchObject({ semanaInicio: SEMANA_A, semanaFin: '2026-11-01', estado: 'ENVIADA', deLibreta: true, minutosAcreditables: 390 });
      expect(res.body.semanas[0].turnos[0]).toMatchObject({ id: turnos[0]!.id, origen: 'LIBRETA', minutosAcreditables: 240 });
      expect(res.body.semanas[1]).toMatchObject({ semanaInicio: SEMANA_B, deLibreta: true, minutosAcreditables: 120 });

      const semana = await semanaDe(c.expediente.id, SEMANA_A);
      expect(semana).toMatchObject({ deLibreta: true, estado: 'ENVIADA', actividades: null, enviadaEn: instanteLocal(HOY, '12:00') });
      expect(semana!.asistencias).toHaveLength(2);
      expect(semana!.asistencias[0]).toMatchObject({
        id: turnos[0]!.id,
        estado: 'CERRADA',
        origen: 'LIBRETA',
        sinConexion: false,
        entrada: instanteLocal('2026-10-27', '08:00'),
        salida: instanteLocal('2026-10-27', '12:00'),
        minutosAcreditables: 240,
      });
      const auditoria = await prisma.auditLog.findMany({ where: { accion: 'REGISTRAR_HORAS_LIBRETA', entidadId: c.expediente.id } });
      expect(auditoria).toHaveLength(1);
      expect(auditoria[0]).toMatchObject({ entidad: 'Expediente', usuarioId: c.usuario.id });
      expect(auditoria[0]!.despues).toMatchObject({ turnos: 3, minutos: 510 });
    });

    it('RN-04: acredita máximo 390 minutos por día entre dos turnos de libreta', async () => {
      const c = await caso();

      const res = await registrar(c.cookie, [turno('2026-10-27', '08:00', '12:00'), turno('2026-10-27', '13:00', '17:00')]);

      expect(res.status).toBe(201);
      const [semana] = res.body.semanas;
      expect(semana.minutosAcreditables).toBe(390);
      expect(semana.turnos.map((t: { minutosAcreditables: number }) => t.minutosAcreditables)).toEqual([240, 150]);
    });

    it('RN-09: un turno de libreta menor a 15 minutos no acredita', async () => {
      const c = await caso();

      const res = await registrar(c.cookie, [turno('2026-10-27', '08:00', '08:10')]);

      expect(res.status).toBe(201);
      expect(res.body.semanas[0].turnos[0].minutosAcreditables).toBe(0);
    });

    it('RN-11: los turnos de libreta cuentan en el avance solo cuando el supervisor valida la semana', async () => {
      const c = await caso();
      const res = await registrar(c.cookie, [turno('2026-10-27', '08:00', '10:00')]);
      const semanaId = res.body.semanas[0].id as string;
      const avance = async () => (await llamar('get', `/api/expedientes/${c.expediente.id}/avance`, c.cookie)).body.avance;

      expect(await avance()).toMatchObject({ minutosValidados: 0, minutosRegistrados: 120 });

      await prisma.semanaBitacora.update({ where: { id: semanaId }, data: { estado: 'VALIDADA' } });
      expect(await avance()).toMatchObject({ minutosValidados: 120, minutosRegistrados: 0 });
    });

    it('RF-17a: el supervisor ve semana y turnos de libreta en su enlace y puede validar o rechazar', async () => {
      const c = await caso();
      const res = await registrar(c.cookie, [turno('2026-10-27', '08:00', '10:00'), turno('2026-11-03', '08:00', '10:00')]);
      const [a, b] = res.body.semanas as { id: string }[];
      await enviarEnlaceValidacion(c.supervisor.id, [a!.id, b!.id], () => instanteLocal('2026-11-16', '08:00'));
      const token = /\/validar\/([A-Za-z0-9_-]+)/.exec(correosEnviados().at(-1)!.texto)![1]!;

      const enlace = await request(app).get(`/api/validacion/${token}`);

      expect(enlace.status).toBe(200);
      expect(enlace.body.enlace.semanas[0]).toMatchObject({ deLibreta: true, actividades: null, estado: 'ENVIADA' });
      expect(enlace.body.enlace.semanas[0].turnos[0]).toMatchObject({ origen: 'LIBRETA', minutosAcreditables: 120 });

      const resolver = await request(app)
        .post(`/api/validacion/${token}`)
        .send({ decisiones: [{ semanaId: a!.id, accion: 'VALIDAR' }, { semanaId: b!.id, accion: 'RECHAZAR', comentario: COMENTARIO }] });
      expect(resolver.status).toBe(200);
      expect((await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: a!.id } })).estado).toBe('VALIDADA');
      expect((await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: b!.id } })).estado).toBe('RECHAZADA');
    });

    it('RF-21: el resumen semanal envía por correo la semana de libreta tal como está', async () => {
      const c = await caso();
      const res = await registrar(c.cookie, [turno('2026-10-27', '08:00', '10:00')]);

      const resumen = await ejecutarResumenSemanal({ ahora: instanteLocal('2026-11-16', '08:00') });

      expect(resumen.enviadasAutomaticamente).toBe(0);
      expect(resumen.notificados).toContainEqual({ supervisorId: c.supervisor.id, semanas: 1 });
      expect(correosEnviados().filter((m) => m.para === c.supervisor.correo)).toHaveLength(1);
      expect((await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: res.body.semanas[0].id } })).estado).toBe('ENVIADA');
    });

    it('RN-17: el resumen semanal no reenvía una semana de libreta rechazada (no tiene bitácora)', async () => {
      const c = await caso();
      const id = await semanaRechazada(c);

      const resumen = await ejecutarResumenSemanal({ ahora: instanteLocal('2026-11-16', '08:00') });

      expect(resumen.enviadasAutomaticamente).toBe(0);
      expect((await prisma.semanaBitacora.findUniqueOrThrow({ where: { id } })).estado).toBe('RECHAZADA');
    });

    it('RN-19: rechaza turnos de libreta en la semana en curso', async () => {
      const c = await caso();

      const res = await registrar(c.cookie, [turno('2026-10-27'), turno(SEMANA_EN_CURSO)]);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'SEMANA_NO_CERRADA', details: [{ index: 1 }] });
      expect(await semanaDe(c.expediente.id, SEMANA_A)).toBeNull();
    });

    it('RN-19: rechaza turnos de libreta anteriores a la fecha de inicio', async () => {
      const c = await caso({ fechaInicio: '2026-10-28' });

      const res = await registrar(c.cookie, [turno('2026-10-27')]);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'ANTES_DE_FECHA_INICIO', details: [{ index: 0 }] });
    });

    it('RN-19: rechaza un turno de libreta que cruza medianoche o termina antes de empezar', async () => {
      const c = await caso();

      const cruza = await registrar(c.cookie, [turno('2026-10-27', '22:00', '00:30')]);
      const igual = await registrar(c.cookie, [turno('2026-10-27', '08:00', '08:00')]);

      expect(cruza.status).toBe(409);
      expect(cruza.body.error).toMatchObject({ code: 'HORARIO_INVALIDO', details: [{ index: 0 }] });
      expect(igual.status).toBe(409);
      expect(igual.body.error.code).toBe('HORARIO_INVALIDO');
    });

    it('RN-19: rechaza turnos de libreta que se traslapan entre sí', async () => {
      const c = await caso();

      const res = await registrar(c.cookie, [turno('2026-10-27', '08:00', '12:00'), turno('2026-10-27', '11:00', '13:00')]);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'ASISTENCIA_TRASLAPADA' });
      expect(res.body.error.details.map((d: { index: number }) => d.index)).toContain(1);
    });

    it('RN-19: rechaza un turno de libreta que se traslapa con un turno ya registrado', async () => {
      const c = await caso();
      await crearAsistencia({ expedienteId: c.expediente.id, entrada: instanteLocal('2026-10-27', '09:00'), minutos: 120 });

      const res = await registrar(c.cookie, [turno('2026-10-27', '08:00', '10:00')]);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'ASISTENCIA_TRASLAPADA', details: [{ index: 0 }] });
    });

    it('RN-19: no mezcla orígenes: rechaza una semana que ya tiene turnos de QR', async () => {
      const c = await caso();
      await crearSemana({ expedienteId: c.expediente.id, semanaInicio: SEMANA_B, estado: 'BORRADOR', minutos: [60] });

      const res = await registrar(c.cookie, [turno('2026-11-03', '15:00', '16:00')]);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'SEMANA_CON_TURNOS_QR', details: [{ index: 0 }] });
    });

    it('RN-19: una semana de libreta ya registrada se edita con PUT, no con otro POST', async () => {
      const c = await caso();
      expect((await registrar(c.cookie, [turno('2026-10-27')])).status).toBe(201);

      const res = await registrar(c.cookie, [turno('2026-10-28')]);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SEMANA_DE_LIBRETA_EXISTENTE');
    });

    it('RN-19: rechaza un identificador de turno que ya existe o que se repite', async () => {
      const c = await caso();
      const repetido = turno('2026-10-27');
      expect((await registrar(c.cookie, [repetido])).status).toBe(201);

      const yaUsado = await registrar(c.cookie, [{ ...turno('2026-11-03'), id: repetido.id }]);
      const mismo = turno('2026-11-03');
      const duplicado = await registrar(c.cookie, [mismo, { ...turno('2026-11-04'), id: mismo.id }]);

      expect(yaUsado.status).toBe(409);
      expect(yaUsado.body.error.code).toBe('ASISTENCIA_ID_EN_USO');
      expect(duplicado.status).toBe(409);
      expect(duplicado.body.error.code).toBe('ASISTENCIA_ID_EN_USO');
    });

    it('RN-19: exige un expediente en proceso con supervisor asignado', async () => {
      const pendiente = await caso({ estado: 'PENDIENTE' });
      const sinSupervisor = await caso({ conSupervisor: false });

      const a = await registrar(pendiente.cookie, [turno('2026-10-27')]);
      const b = await registrar(sinSupervisor.cookie, [turno('2026-10-27')]);

      expect(a.status).toBe(409);
      expect(a.body.error.code).toBe('EXPEDIENTE_NO_ACTIVO');
      expect(b.status).toBe(409);
      expect(b.body.error.code).toBe('SIN_SUPERVISOR');
    });

    it('RF-17a: responde 400 con un cuerpo inválido', async () => {
      const c = await caso();
      const ok = turno('2026-10-27');

      for (const turnos of [[], undefined, [{ ...ok, fecha: '27/10/2026' }], [{ ...ok, entrada: '8:00' }], [{ ...ok, id: 'no-uuid' }], [{ ...ok, extra: 1 }], Array.from({ length: 201 }, () => turno('2026-10-27'))]) {
        const res = await registrar(c.cookie, turnos);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('RF-17a: responde 401 sin sesión y 403 para vinculación y administración', async () => {
      const cuerpo = [turno('2026-10-27')];

      expect((await registrar(null, cuerpo)).status).toBe(401);
      expect((await registrar(cookieVinculacion, cuerpo)).status).toBe(403);
      expect((await registrar(cookieAdmin, cuerpo)).status).toBe(403);
    });

    it('RF-17a: el historial marca la semana y los turnos de libreta y no permite corregirlos uno por uno', async () => {
      const c = await caso();
      await registrar(c.cookie, [turno('2026-10-27')]);

      const res = await llamar('get', `/api/asistencias?semana=${SEMANA_A}`, c.cookie);

      expect(res.status).toBe(200);
      expect(res.body.semana).toMatchObject({ deLibreta: true, puedeEditar: false, puedeEnviar: false });
      const turnoDia = (res.body.semana).dias[1].turnos[0];
      expect(turnoDia).toMatchObject({ origen: 'LIBRETA', puedeSolicitarCorreccion: false });
    });

    it('RF-17: no permite solicitar la corrección de un turno de libreta', async () => {
      const c = await caso();
      const id = await semanaRechazada(c);
      const turnoId = (await semanaDe(c.expediente.id, SEMANA_B))!.asistencias[0]!.id;

      const res = await llamar('post', `/api/asistencias/${turnoId}/correcciones`, c.cookie, {
        entradaNueva: instanteLocal('2026-11-03', '08:00').toISOString(),
        salidaNueva: instanteLocal('2026-11-03', '09:00').toISOString(),
        motivo: 'Me equivoqué al copiar la hora.',
      });

      expect(id).toBeTruthy();
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('TURNO_DE_LIBRETA');
    });

    it('RN-19: un escaneo no se mezcla con una semana de libreta', async () => {
      const c = await caso();
      await prisma.semanaBitacora.create({
        data: { expedienteId: c.expediente.id, semanaInicio: new Date(`${SEMANA_EN_CURSO}T00:00:00.000Z`), deLibreta: true, estado: 'ENVIADA' },
      });

      const res = await llamar('post', '/api/asistencias/escaneo', c.cookie, { id: randomUUID(), codigoCorto: c.institucion.codigoCorto });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SEMANA_DE_LIBRETA');
      expect(await prisma.asistencia.count({ where: { expedienteId: c.expediente.id } })).toBe(0);
    });
  });

  describe('bitácora de una semana de libreta (RN-17)', () => {
    it('RN-17: guardarBitacora y enviarSemana rechazan una semana de libreta', async () => {
      const c = await caso();
      const id = await semanaRechazada(c);

      const guardar = await llamar('put', `/api/semanas/${id}/bitacora`, c.cookie, { actividades: 'Texto' });
      const enviar = await llamar('post', `/api/semanas/${id}/enviar`, c.cookie);

      expect(guardar.status).toBe(409);
      expect(guardar.body.error.code).toBe('SEMANA_DE_LIBRETA');
      expect(enviar.status).toBe(409);
      expect(enviar.body.error.code).toBe('SEMANA_DE_LIBRETA');
    });

    it('RF-18: los pendientes marcan la semana de libreta rechazada', async () => {
      const c = await caso();
      const id = await semanaRechazada(c);

      const res = await llamar('get', '/api/semanas/pendientes', c.cookie);

      expect(res.body.pendientes).toEqual([expect.objectContaining({ id, motivo: 'RECHAZADA', deLibreta: true, comentario: COMENTARIO })]);
    });
  });

  describe('PUT /api/semanas/:id/libreta', () => {
    it('RF-17a: reemplaza los turnos de la semana rechazada y la vuelve a enviar', async () => {
      const c = await caso();
      const id = await semanaRechazada(c);
      const viejo = (await semanaDe(c.expediente.id, SEMANA_B))!.asistencias[0]!.id;
      const nuevos = [turno('2026-11-03', '08:00', '11:00'), turno('2026-11-04', '08:00', '09:00')];

      const res = await corregir(id, c.cookie, nuevos);

      expect(res.status).toBe(200);
      expect(res.body.semana).toMatchObject({ id, estado: 'ENVIADA', deLibreta: true, minutosAcreditables: 240 });
      expect(res.body.semana.turnos.map((t: { id: string }) => t.id)).toEqual(nuevos.map((t) => t.id));
      const semana = await semanaDe(c.expediente.id, SEMANA_B);
      expect(semana).toMatchObject({ estado: 'ENVIADA', enviadaEn: instanteLocal(HOY, '12:00'), comentario: COMENTARIO, rechazadaEn: instanteLocal(HOY, '09:00') });
      expect(semana!.asistencias.map((a) => a.id)).toEqual(nuevos.map((t) => t.id));
      expect(await prisma.asistencia.findUnique({ where: { id: viejo } })).toBeNull();
      expect(await prisma.auditLog.count({ where: { accion: 'CORREGIR_HORAS_LIBRETA', entidad: 'SemanaBitacora', entidadId: id } })).toBe(1);
    });

    it('RN-19: solo se puede corregir una semana de libreta rechazada', async () => {
      const c = await caso();
      const id = await semanaRechazada(c);
      const cuerpo = [turno('2026-11-03')];

      for (const estado of ['ENVIADA', 'VALIDADA', 'BORRADOR'] as const) {
        await prisma.semanaBitacora.update({ where: { id }, data: { estado } });
        const res = await corregir(id, c.cookie, cuerpo);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('SEMANA_NO_EDITABLE');
      }
    });

    it('RN-19: una semana que no es de libreta no se corrige por esta ruta', async () => {
      const c = await caso();
      const semana = await crearSemana({ expedienteId: c.expediente.id, semanaInicio: SEMANA_B, estado: 'RECHAZADA', minutos: [60] });

      const res = await corregir(semana.id, c.cookie, [turno('2026-11-03')]);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SEMANA_NO_DE_LIBRETA');
    });

    it('RN-19: los turnos corregidos deben caer dentro de la semana', async () => {
      const c = await caso();
      const id = await semanaRechazada(c);

      const res = await corregir(id, c.cookie, [turno('2026-11-03'), turno('2026-11-10')]);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'TURNO_FUERA_DE_SEMANA', details: [{ index: 1 }] });
      expect((await semanaDe(c.expediente.id, SEMANA_B))!.estado).toBe('RECHAZADA');
    });

    it('RN-04: la corrección recalcula el tope diario de 390 minutos', async () => {
      const c = await caso();
      const id = await semanaRechazada(c);

      const res = await corregir(id, c.cookie, [turno('2026-11-03', '07:00', '12:00'), turno('2026-11-03', '13:00', '17:00')]);

      expect(res.status).toBe(200);
      expect(res.body.semana.minutosAcreditables).toBe(390);
    });

    it('RF-17a: responde 400 con un cuerpo inválido', async () => {
      const c = await caso();
      const id = await semanaRechazada(c);

      for (const turnos of [[], [{ ...turno('2026-11-03'), salida: '9' }]]) {
        expect((await corregir(id, c.cookie, turnos)).status).toBe(400);
      }
      expect((await llamar('put', '/api/semanas/no-uuid/libreta', c.cookie, { turnos: [turno('2026-11-03')] })).status).toBe(400);
    });

    it('RF-17a: responde 401 sin sesión, 403 por rol y 403 para la semana de otro alumno', async () => {
      const c = await caso();
      const otro = await caso();
      const id = await semanaRechazada(c);
      const cuerpo = [turno('2026-11-03')];

      expect((await corregir(id, null, cuerpo)).status).toBe(401);
      expect((await corregir(id, cookieVinculacion, cuerpo)).status).toBe(403);
      expect((await corregir(id, cookieAdmin, cuerpo)).status).toBe(403);
      expect((await corregir(id, otro.cookie, cuerpo)).status).toBe(403);
      expect((await corregir(randomUUID(), c.cookie, cuerpo)).status).toBe(404);
    });
  });
});
