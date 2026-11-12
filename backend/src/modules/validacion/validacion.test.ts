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
  iniciarSesion,
  PASSWORD_PRUEBA,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { hashToken } from '../../domain/tokens.js';
import { env } from '../../config/env.js';
import { correosEnviados, limpiarCorreos } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import { instanteLocal } from '../../lib/tiempo.js';
import { enviarEnlaceValidacion } from './validacion.service.js';

// Wednesday 2026-11-11, noon in Monterrey. Weeks of 2026-11-02 and 2026-11-09 (Mondays).
const HOY = instanteLocal('2026-11-11', '12:00');
const ahora = () => HOY;
const DIAS = 86_400_000;

describe('validación por enlace (RF-21, RF-21a, RF-22, RN-06b)', () => {
  const app = createApp();
  let plantelId: string;
  let contador = 0;

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
  });

  beforeEach(() => limpiarCorreos());

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  // A supervisor with students in practices (Mon-Fri 08:00-14:00). Each entry in `semanas` is one student's week.
  async function caso({
    alumnos = 1,
    tipo = 'PRACTICAS' as 'PRACTICAS' | 'SERVICIO_SOCIAL',
    estado = 'ENVIADA' as 'ENVIADA' | 'VALIDADA' | 'RECHAZADA' | 'BORRADOR',
    minutos = [120, 60],
  } = {}) {
    const institucion = await crearInstitucion({ plantelId, nombre: 'Empresa Demo' });
    const supervisor = await crearSupervisor({ institucionId: institucion.id });
    const filas = [];
    for (let i = 0; i < alumnos; i++) {
      contador++;
      const usuario = await crearAlumnoPrecargado({
        plantelId,
        matricula: `2531906399${String(contador).padStart(4, '0')}`,
        nombre: i === 0 ? 'Ana María' : `Alumno${contador}`,
        apellidoPaterno: i === 0 ? 'López' : 'Pérez',
        password: PASSWORD_PRUEBA,
      });
      const expediente = await crearExpediente({
        alumnoId: usuario.alumno!.id,
        tipo,
        institucionId: institucion.id,
        datos: { supervisorId: supervisor.id, diasPactados: [1, 2, 3, 4, 5], horaEntrada: '08:00', horaSalida: '14:00' },
      });
      const semana = await crearSemana({ expedienteId: expediente.id, semanaInicio: '2026-11-02', estado, minutos });
      filas.push({ usuario, expedienteId: expediente.id, semana });
    }
    return { supervisor, institucion, filas };
  }

  // Creates the link through the real service and reads the token from the email, as the supervisor would.
  async function crearEnlace(supervisorId: string, semanaIds: string[], cuando: () => Date = ahora) {
    const enlaceId = await enviarEnlaceValidacion(supervisorId, semanaIds, cuando);
    const correo = correosEnviados().at(-1)!;
    const token = /\/validar\/([A-Za-z0-9_-]+)/.exec(correo.texto)![1]!;
    return { enlaceId, token, correo };
  }

  // Only Date is faked: the database and sockets keep working.
  const conFecha = async <T>(momento: Date, fn: () => Promise<T>) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(momento);
    try {
      return await fn();
    } finally {
      vi.useRealTimers();
    }
  };
  const obtener = (token: string, momento = HOY) => conFecha(momento, async () => request(app).get(`/api/validacion/${token}`));
  const decidir = (token: string, body: unknown, momento = HOY) =>
    conFecha(momento, async () => request(app).post(`/api/validacion/${token}`).send(body as object));

  describe('enviarEnlaceValidacion', () => {
    it('RF-21a: crea un enlace con las semanas incluidas que vence a los 14 días', async () => {
      const { supervisor, filas } = await caso({ alumnos: 2 });
      const ids = filas.map((f) => f.semana.id);

      const enlaceId = await enviarEnlaceValidacion(supervisor.id, ids, ahora);

      const enlace = await prisma.enlaceValidacion.findUniqueOrThrow({ where: { id: enlaceId }, include: { semanas: true } });
      expect(enlace.supervisorId).toBe(supervisor.id);
      expect(enlace.semanas.map((s) => s.semanaId).sort()).toEqual([...ids].sort());
      expect(enlace.expiraEn.getTime()).toBe(HOY.getTime() + 14 * DIAS);
    });

    it('RF-21: el correo va al correo actual del supervisor con el enlace, el nombre y los alumnos', async () => {
      const { supervisor, filas } = await caso({ alumnos: 2 });
      await prisma.supervisor.update({ where: { id: supervisor.id }, data: { correo: 'nuevo@empresa.invalid' } });

      const { correo, token } = await crearEnlace(supervisor.id, filas.map((f) => f.semana.id));

      expect(correosEnviados()).toHaveLength(1);
      expect(correo.para).toBe('nuevo@empresa.invalid');
      for (const parte of [correo.texto, correo.html]) {
        expect(parte).toContain(`${env.FRONTEND_ORIGIN}/validar/${token}`);
        expect(parte).toContain('Laura');
        expect(parte).toContain('Ana María López');
        expect(parte).toContain('semana del 2 al 8 de noviembre');
        expect(parte).toContain('14 días');
        expect(parte).toContain('cuenta');
      }
      expect(correo.asunto).toMatch(/validaci/i);
    });

    it('RF-21: el nombre del alumno se escapa en la versión HTML', async () => {
      const { supervisor, filas } = await caso();
      await prisma.alumno.update({ where: { usuarioId: filas[0]!.usuario.id }, data: { nombre: '<b>Ana</b>' } });

      const { correo } = await crearEnlace(supervisor.id, [filas[0]!.semana.id]);

      expect(correo.html).not.toContain('<b>Ana</b>');
      expect(correo.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    });

    it('RF-21: una semana que cruza de mes se escribe completa', async () => {
      const { supervisor, filas } = await caso();
      const semana = await prisma.semanaBitacora.update({
        where: { id: filas[0]!.semana.id },
        data: { semanaInicio: new Date('2026-11-30T00:00:00.000Z') },
      });

      const { correo } = await crearEnlace(supervisor.id, [semana.id]);

      expect(correo.texto).toContain('semana del 30 de noviembre al 6 de diciembre');
    });

    it('RNF-06: el token no se guarda en claro, solo su hash SHA-256', async () => {
      const { supervisor, filas } = await caso();

      const { enlaceId, token } = await crearEnlace(supervisor.id, [filas[0]!.semana.id]);

      const enlace = await prisma.enlaceValidacion.findUniqueOrThrow({ where: { id: enlaceId } });
      expect(enlace.tokenHash).toBe(hashToken(token));
      expect(JSON.stringify(enlace)).not.toContain(token);
    });

    it('RF-21a: un enlace nuevo no invalida los anteriores', async () => {
      const { supervisor, filas } = await caso();
      const ids = [filas[0]!.semana.id];
      const primero = await crearEnlace(supervisor.id, ids);
      await crearEnlace(supervisor.id, ids);

      expect((await obtener(primero.token)).status).toBe(200);
    });

    it('RF-21: rechaza una semana de otro supervisor y una lista vacía sin crear nada', async () => {
      const { supervisor, filas } = await caso();
      const otro = await caso();

      await expect(enviarEnlaceValidacion(supervisor.id, [otro.filas[0]!.semana.id], ahora)).rejects.toThrow();
      await expect(enviarEnlaceValidacion(supervisor.id, [], ahora)).rejects.toThrow();
      await expect(enviarEnlaceValidacion(supervisor.id, [randomUUID()], ahora)).rejects.toThrow();
      expect(await prisma.enlaceValidacion.count({ where: { supervisorId: supervisor.id } })).toBe(0);
      expect(correosEnviados()).toHaveLength(0);
      expect(filas).toHaveLength(1);
    });
  });

  describe('GET /api/validacion/:token', () => {
    it('RF-21: el enlace vigente devuelve al supervisor y las semanas con turnos y total, sin sesión', async () => {
      const { supervisor, filas } = await caso({ alumnos: 2 });
      const { token } = await crearEnlace(supervisor.id, filas.map((f) => f.semana.id));
      await prisma.semanaBitacora.update({ where: { id: filas[0]!.semana.id }, data: { actividades: 'Capturé expedientes.' } });

      const res = await obtener(token);

      expect(res.status).toBe(200);
      expect(res.body.enlace.supervisor).toEqual({ nombre: 'Laura Mendoza' });
      expect(res.body.enlace.expiraEn).toBe(new Date(HOY.getTime() + 14 * DIAS).toISOString());
      expect(res.body.enlace.semanas).toHaveLength(2);
      const ana = res.body.enlace.semanas.find((s: { id: string }) => s.id === filas[0]!.semana.id);
      expect(ana).toMatchObject({
        id: filas[0]!.semana.id,
        alumno: { nombre: 'Ana María López García', carrera: expect.stringContaining('Carrera de prueba') },
        institucion: 'Empresa Demo',
        semanaInicio: '2026-11-02',
        semanaFin: '2026-11-08',
        estado: 'ENVIADA',
        actividades: 'Capturé expedientes.',
        minutosAcreditables: 180,
      });
      expect(ana.turnos).toHaveLength(2);
      expect(ana.turnos[0]).toEqual({
        entrada: expect.any(String),
        salida: expect.any(String),
        estado: 'CERRADA',
        minutosAcreditables: 120,
        fueraDeHorario: false,
      });
    });

    it('RNF-07: no expone la matrícula ni otros datos del alumno', async () => {
      const { supervisor, filas } = await caso();
      const { token } = await crearEnlace(supervisor.id, [filas[0]!.semana.id]);

      const res = await obtener(token);

      expect(JSON.stringify(res.body)).not.toContain(filas[0]!.usuario.username);
      expect(JSON.stringify(res.body)).not.toContain('@alumno.praxis.invalid');
    });

    it('RF-21: un token desconocido devuelve 404 ENLACE_NO_VALIDO', async () => {
      const res = await obtener('token-que-no-existe');

      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({ code: 'ENLACE_NO_VALIDO', message: 'Este enlace no es válido.' });
    });

    it('RF-21: un enlace vencido devuelve 410 ENLACE_VENCIDO', async () => {
      const { supervisor, filas } = await caso();
      const { token } = await crearEnlace(supervisor.id, [filas[0]!.semana.id], () => new Date(HOY.getTime() - 15 * DIAS));

      const res = await obtener(token);

      expect(res.status).toBe(410);
      expect(res.body.error).toEqual({ code: 'ENLACE_VENCIDO', message: 'Este enlace venció. Usa el del correo más reciente.' });
    });

    it('RF-21: el enlace vence exactamente a los 14 días', async () => {
      const { supervisor, filas } = await caso();
      const { token } = await crearEnlace(supervisor.id, [filas[0]!.semana.id]);

      expect((await obtener(token, new Date(HOY.getTime() + 14 * DIAS - 1000))).status).toBe(200);
      expect((await obtener(token, new Date(HOY.getTime() + 14 * DIAS))).status).toBe(410);
    });

    it('RF-21: una semana ya validada aparece con su estado', async () => {
      const { supervisor, filas } = await caso();
      const { token } = await crearEnlace(supervisor.id, [filas[0]!.semana.id]);
      await prisma.semanaBitacora.update({ where: { id: filas[0]!.semana.id }, data: { estado: 'VALIDADA' } });

      const res = await obtener(token);

      expect(res.body.enlace.semanas[0].estado).toBe('VALIDADA');
    });

    it('RN-06b: marca los turnos fuera del horario pactado', async () => {
      const { supervisor, filas } = await caso({ minutos: [] });
      const { expedienteId, semana } = filas[0]!;
      const turno = (dia: string, desde: string, minutos: number) =>
        crearAsistencia({ expedienteId, entrada: instanteLocal(dia, desde), minutos, semanaId: semana.id });
      await turno('2026-11-07', '09:00', 120); // Saturday: day not agreed
      await turno('2026-11-02', '02:00', 120); // Monday 02:00-04:00: no overlap with 08:00-14:00
      await turno('2026-11-03', '07:00', 120); // arrives early, overlaps
      await turno('2026-11-04', '13:00', 180); // leaves late, overlaps
      await turno('2026-11-05', '09:00', 120); // inside
      const { token } = await crearEnlace(supervisor.id, [semana.id]);

      const res = await obtener(token);

      const marcas = res.body.enlace.semanas[0].turnos.map((t: { entrada: string; fueraDeHorario: boolean }) => [
        t.entrada,
        t.fueraDeHorario,
      ]);
      expect(marcas).toEqual([
        [instanteLocal('2026-11-02', '02:00').toISOString(), true],
        [instanteLocal('2026-11-03', '07:00').toISOString(), false],
        [instanteLocal('2026-11-04', '13:00').toISOString(), false],
        [instanteLocal('2026-11-05', '09:00').toISOString(), false],
        [instanteLocal('2026-11-07', '09:00').toISOString(), true],
      ]);
    });

    it('RN-06b: en servicio social ningún turno se marca', async () => {
      const { supervisor, filas } = await caso({ tipo: 'SERVICIO_SOCIAL', minutos: [] });
      const { expedienteId, semana } = filas[0]!;
      await crearAsistencia({ expedienteId, entrada: instanteLocal('2026-11-07', '02:00'), minutos: 120, semanaId: semana.id });
      const { token } = await crearEnlace(supervisor.id, [semana.id]);

      const res = await obtener(token);

      expect(res.body.enlace.semanas[0].turnos.map((t: { fueraDeHorario: boolean }) => t.fueraDeHorario)).toEqual([false]);
    });
  });

  describe('POST /api/validacion/:token', () => {
    const validar = (semanaId: string) => ({ semanaId, accion: 'VALIDAR' });
    const rechazar = (semanaId: string, comentario?: string) => ({ semanaId, accion: 'RECHAZAR', comentario });

    it('RF-21a: valida todas las semanas a la vez sin sesión y marca al supervisor', async () => {
      const { supervisor, filas } = await caso({ alumnos: 2 });
      const ids = filas.map((f) => f.semana.id);
      const { token } = await crearEnlace(supervisor.id, ids);

      const res = await decidir(token, { decisiones: ids.map(validar) });

      expect(res.status).toBe(200);
      expect(res.body.resultados).toEqual(ids.map((semanaId) => ({ semanaId, resultado: 'VALIDADA' })));
      for (const id of ids) {
        const semana = await prisma.semanaBitacora.findUniqueOrThrow({ where: { id } });
        expect(semana).toMatchObject({ estado: 'VALIDADA', validadoPor: 'SUPERVISOR' });
        expect(semana.validadoEn?.getTime()).toBe(HOY.getTime());
      }
    });

    it('RF-21a: resuelve una por una, validando una y rechazando otra', async () => {
      const { supervisor, filas } = await caso({ alumnos: 2 });
      const [a, b] = filas.map((f) => f.semana.id) as [string, string];
      const { token } = await crearEnlace(supervisor.id, [a, b]);

      const primera = await decidir(token, { decisiones: [validar(a)] });
      const segunda = await decidir(token, { decisiones: [rechazar(b, '  Faltó detallar las actividades  ')] });

      expect(primera.body.resultados).toEqual([{ semanaId: a, resultado: 'VALIDADA' }]);
      expect(segunda.body.resultados).toEqual([{ semanaId: b, resultado: 'RECHAZADA' }]);
      expect(await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: a } })).toMatchObject({ estado: 'VALIDADA', rechazadaEn: null });
      expect(await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: b } })).toMatchObject({
        estado: 'RECHAZADA',
        rechazadaEn: expect.any(Date),
        comentario: 'Faltó detallar las actividades',
        validadoPor: null,
        validadoEn: null,
      });
    });

    it('RF-22: rechazar sin comentario o con menos de 5 caracteres devuelve 400 y no cambia nada', async () => {
      const { supervisor, filas } = await caso();
      const id = filas[0]!.semana.id;
      const { token } = await crearEnlace(supervisor.id, [id]);

      for (const comentario of [undefined, '', '    ', ' abc ', 'abcd  ']) {
        const res = await decidir(token, { decisiones: [rechazar(id, comentario)] });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect((await decidir(token, { decisiones: [rechazar(id, 'abcde')] })).status).toBe(200);
    });

    it('RF-21a: sin decisiones, con una acción inválida o con la misma semana dos veces devuelve 400', async () => {
      const { supervisor, filas } = await caso();
      const id = filas[0]!.semana.id;
      const { token } = await crearEnlace(supervisor.id, [id]);

      expect((await decidir(token, { decisiones: [] })).status).toBe(400);
      expect((await decidir(token, {})).status).toBe(400);
      expect((await decidir(token, { decisiones: [{ semanaId: id, accion: 'BORRAR' }] })).status).toBe(400);
      expect((await decidir(token, { decisiones: [validar(id), validar(id)] })).status).toBe(400);
      expect((await decidir(token, { decisiones: [validar('no-es-uuid')] })).status).toBe(400);
    });

    it('RF-21: una semana que no pertenece al enlace devuelve 400 SEMANA_FUERA_DEL_ENLACE y no resuelve ninguna', async () => {
      const { supervisor, filas } = await caso();
      const ajena = await caso();
      const propia = filas[0]!.semana.id;
      const { token } = await crearEnlace(supervisor.id, [propia]);

      const res = await decidir(token, { decisiones: [validar(propia), validar(ajena.filas[0]!.semana.id)] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SEMANA_FUERA_DEL_ENLACE');
      expect((await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: propia } })).estado).toBe('ENVIADA');
    });

    it('RF-21a: una semana ya resuelta por otra persona responde YA_RESUELTA y no se sobrescribe', async () => {
      const { supervisor, filas } = await caso({ alumnos: 2 });
      const [a, b] = filas.map((f) => f.semana.id) as [string, string];
      const { token } = await crearEnlace(supervisor.id, [a, b]);
      await prisma.semanaBitacora.update({ where: { id: a }, data: { estado: 'VALIDADA', validadoPor: 'otra-persona' } });

      const res = await decidir(token, { decisiones: [rechazar(a, 'Comentario tardío'), validar(b)] });

      expect(res.status).toBe(200);
      expect(res.body.resultados).toEqual([
        { semanaId: a, resultado: 'YA_RESUELTA' },
        { semanaId: b, resultado: 'VALIDADA' },
      ]);
      expect(await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: a } })).toMatchObject({
        estado: 'VALIDADA',
        validadoPor: 'otra-persona',
        comentario: null,
      });
      const auditorias = await prisma.auditLog.findMany({ where: { entidadId: a, accion: { in: ['VALIDAR_SEMANA', 'RECHAZAR_SEMANA'] } } });
      expect(auditorias).toHaveLength(0);
    });

    it('RF-21: repetir la misma decisión responde YA_RESUELTA', async () => {
      const { supervisor, filas } = await caso();
      const id = filas[0]!.semana.id;
      const { token } = await crearEnlace(supervisor.id, [id]);

      await decidir(token, { decisiones: [validar(id)] });
      const res = await decidir(token, { decisiones: [validar(id)] });

      expect(res.body.resultados).toEqual([{ semanaId: id, resultado: 'YA_RESUELTA' }]);
    });

    it('RF-29: cada decisión deja su auditoría sin usuario, con el supervisor y el enlace', async () => {
      const { supervisor, filas } = await caso({ alumnos: 2 });
      const [a, b] = filas.map((f) => f.semana.id) as [string, string];
      const { token, enlaceId } = await crearEnlace(supervisor.id, [a, b]);

      await decidir(token, { decisiones: [validar(a), rechazar(b, 'Falta detalle')] });

      const validada = await prisma.auditLog.findFirstOrThrow({ where: { entidadId: a, accion: 'VALIDAR_SEMANA' } });
      expect(validada).toMatchObject({
        usuarioId: null,
        entidad: 'SemanaBitacora',
        antes: { estado: 'ENVIADA' },
        despues: { estado: 'VALIDADA', supervisorId: supervisor.id, enlaceId },
      });
      const rechazada = await prisma.auditLog.findFirstOrThrow({ where: { entidadId: b, accion: 'RECHAZAR_SEMANA' } });
      expect(rechazada).toMatchObject({
        usuarioId: null,
        antes: { estado: 'ENVIADA' },
        despues: { estado: 'RECHAZADA', supervisorId: supervisor.id, enlaceId, comentario: 'Falta detalle' },
      });
    });

    it('RF-21: un token desconocido devuelve 404 y uno vencido 410, antes de validar el cuerpo', async () => {
      const { supervisor, filas } = await caso();
      const id = filas[0]!.semana.id;
      const vencido = await crearEnlace(supervisor.id, [id], () => new Date(HOY.getTime() - 15 * DIAS));

      const desconocido = await decidir('token-que-no-existe', { cuerpo: 'inválido' });
      const caducado = await decidir(vencido.token, { cuerpo: 'inválido' });

      expect(desconocido.status).toBe(404);
      expect(desconocido.body.error.code).toBe('ENLACE_NO_VALIDO');
      expect(caducado.status).toBe(410);
      expect(caducado.body.error.code).toBe('ENLACE_VENCIDO');
      expect((await prisma.semanaBitacora.findUniqueOrThrow({ where: { id } })).estado).toBe('ENVIADA');
    });

    it('RN-11: las horas de una semana validada por enlace cuentan como validadas', async () => {
      const { supervisor, filas } = await caso({ minutos: [120, 60] });
      const { semana, expedienteId, usuario } = filas[0]!;
      const cookie = await iniciarSesion(app, usuario);
      const avance = async () =>
        (await conFecha(HOY, async () => request(app).get(`/api/expedientes/${expedienteId}/avance`).set('Cookie', cookie))).body.avance;
      expect(await avance()).toMatchObject({ minutosValidados: 0, minutosRegistrados: 180 });
      const { token } = await crearEnlace(supervisor.id, [semana.id]);

      await decidir(token, { decisiones: [validar(semana.id)] });

      expect(await avance()).toMatchObject({ minutosValidados: 180, minutosRegistrados: 0 });
    });

    it('RF-22: una semana rechazada muestra el comentario al alumno y vuelve a ser editable', async () => {
      const { supervisor, filas } = await caso();
      const { semana, usuario } = filas[0]!;
      const { token } = await crearEnlace(supervisor.id, [semana.id]);
      await decidir(token, { decisiones: [rechazar(semana.id, 'Detalla mejor las actividades')] });
      const cookie = await iniciarSesion(app, usuario);

      const res = await conFecha(HOY, async () => request(app).get('/api/asistencias').query({ semana: '2026-11-02' }).set('Cookie', cookie));

      expect(res.body.semana).toMatchObject({
        estadoValidacion: 'RECHAZADA',
        comentario: 'Detalla mejor las actividades',
        puedeEditar: true,
      });
    });
  });
});
