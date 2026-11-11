import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EstadoExpediente, TipoPrograma } from '../../generated/prisma/enums.js';
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
import { prisma } from '../../lib/prisma.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

describe('acciones de vinculación sobre el expediente (RF-11, RF-12, RN-12, RN-03a)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let cookiePracticas: string;
  let cookieServicio: string;
  let cookieAdmin: string;
  let cookieOtroPlantel: string;
  let contador = 0;

  // `null` means no session cookie (undefined would fall back to the Prácticas cookie).
  const pedir = (metodo: 'get' | 'post' | 'patch', ruta: string, body?: object, cookie: string | null = cookiePracticas) => {
    const req = request(app)[metodo](`/api/expedientes${ruta}`).set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    return body ? req.send(body) : req;
  };

  async function caso({
    tipo = 'PRACTICAS',
    estado = 'EN_PROCESO',
    semestre = 5,
    semestreAlumno = semestre,
    plantel = plantelId,
    datos = {},
  }: {
    tipo?: TipoPrograma;
    estado?: EstadoExpediente;
    semestre?: number;
    semestreAlumno?: number;
    plantel?: string;
    datos?: Parameters<typeof crearExpediente>[0]['datos'];
  } = {}) {
    contador++;
    const matricula = `2531905288${String(contador).padStart(4, '0')}`;
    const usuario = await crearAlumnoPrecargado({ plantelId: plantel, matricula, password: PASSWORD_PRUEBA });
    const alumnoId = usuario.alumno!.id;
    if (semestreAlumno !== 5) await prisma.alumno.update({ where: { id: alumnoId }, data: { semestre: semestreAlumno } });
    const expediente = await crearExpediente({ alumnoId, tipo, estado, semestre, datos });
    return { usuario, alumnoId, expediente, id: expediente.id, cookie: () => iniciarSesion(app, usuario) };
  }
  const institucion = (datos: Parameters<typeof crearInstitucion>[0]['datos'] = {}, plantel = plantelId) =>
    crearInstitucion({ plantelId: plantel, datos });

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    cookiePracticas = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
    cookieServicio = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }));
    cookieAdmin = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ADMIN' }));
    cookieOtroPlantel = await iniciarSesion(app, await crearUsuario({ plantelId: otroPlantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  const auditoria = (entidadId: string, accion: string) => prisma.auditLog.findMany({ where: { entidadId, accion } });

  describe('PATCH /api/expedientes/:id/estado', () => {
    it.each([
      ['SUSPENDER', 'EN_PROCESO', 'SUSPENDIDO', 'SUSPENDER_EXPEDIENTE'],
      ['REACTIVAR', 'SUSPENDIDO', 'EN_PROCESO', 'REACTIVAR_EXPEDIENTE'],
      ['CANCELAR', 'PENDIENTE', 'CANCELADO', 'CANCELAR_EXPEDIENTE'],
      ['CANCELAR', 'EN_PROCESO', 'CANCELADO', 'CANCELAR_EXPEDIENTE'],
      ['CANCELAR', 'SUSPENDIDO', 'CANCELADO', 'CANCELAR_EXPEDIENTE'],
    ] as const)('RF-12: %s desde %s deja el expediente %s y audita el motivo', async (accion, desde, hasta, auditada) => {
      const c = await caso({ estado: desde });

      const res = await pedir('patch', `/${c.id}/estado`, { accion, motivo: '  Cambio de domicilio  ' });

      expect(res.status).toBe(200);
      expect(res.body.expediente).toMatchObject({ id: c.id, estado: hasta });
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe(hasta);
      const filas = await auditoria(c.id, auditada);
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        entidad: 'Expediente',
        antes: { estado: desde },
        despues: { estado: hasta, motivo: 'Cambio de domicilio' },
      });
      expect(filas[0]!.usuarioId).toBeTruthy();
    });

    it('RF-12: el admin también puede cambiar el estado', async () => {
      const c = await caso();
      expect((await pedir('patch', `/${c.id}/estado`, { accion: 'SUSPENDER', motivo: 'Incapacidad' }, cookieAdmin)).status).toBe(200);
    });

    it.each([
      ['SUSPENDER', 'PENDIENTE'],
      ['SUSPENDER', 'SUSPENDIDO'],
      ['SUSPENDER', 'FINALIZADO'],
      ['SUSPENDER', 'CANCELADO'],
      ['REACTIVAR', 'PENDIENTE'],
      ['REACTIVAR', 'EN_PROCESO'],
      ['REACTIVAR', 'FINALIZADO'],
      ['CANCELAR', 'FINALIZADO'],
      ['CANCELAR', 'CANCELADO'],
    ] as const)('RF-12: %s desde %s responde 409 y no cambia nada', async (accion, desde) => {
      const c = await caso({ estado: desde });

      const res = await pedir('patch', `/${c.id}/estado`, { accion, motivo: 'Motivo' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('TRANSICION_NO_PERMITIDA');
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe(desde);
      expect(await prisma.auditLog.count({ where: { entidadId: c.id } })).toBe(0);
    });

    it('RF-12: dos suspensiones simultáneas no ganan las dos', async () => {
      const c = await caso();

      const respuestas = await Promise.all([
        pedir('patch', `/${c.id}/estado`, { accion: 'SUSPENDER', motivo: 'Uno' }),
        pedir('patch', `/${c.id}/estado`, { accion: 'SUSPENDER', motivo: 'Dos' }),
      ]);

      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await auditoria(c.id, 'SUSPENDER_EXPEDIENTE')).toHaveLength(1);
    });

    it('RF-12: suspender y cancelar a la vez deja un solo estado final y una sola auditoría', async () => {
      const c = await caso();

      const respuestas = await Promise.all([
        pedir('patch', `/${c.id}/estado`, { accion: 'SUSPENDER', motivo: 'Uno' }),
        pedir('patch', `/${c.id}/estado`, { accion: 'CANCELAR', motivo: 'Dos' }),
      ]);

      const exitosas = respuestas.filter((r) => r.status === 200);
      expect(exitosas.length).toBeGreaterThanOrEqual(1);
      const total = await prisma.auditLog.count({ where: { entidadId: c.id } });
      expect(total).toBe(exitosas.length);
    });

    it.each([
      ['falta el motivo', { accion: 'SUSPENDER' }],
      ['motivo vacío', { accion: 'SUSPENDER', motivo: '   ' }],
      ['motivo demasiado largo', { accion: 'SUSPENDER', motivo: 'x'.repeat(501) }],
      ['acción desconocida', { accion: 'FINALIZAR', motivo: 'Motivo' }],
      ['falta la acción', { motivo: 'Motivo' }],
      ['campo desconocido', { accion: 'SUSPENDER', motivo: 'Motivo', estado: 'CANCELADO' }],
    ])('RF-12: 400 si %s', async (_caso, body) => {
      const c = await caso();

      const res = await pedir('patch', `/${c.id}/estado`, body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe('EN_PROCESO');
    });

    it('RF-12: 400 si el id no es un uuid', async () => {
      const res = await pedir('patch', '/no-es-uuid/estado', { accion: 'SUSPENDER', motivo: 'Motivo' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('RF-12: 401 sin sesión', async () => {
      const c = await caso();
      expect((await pedir('patch', `/${c.id}/estado`, { accion: 'SUSPENDER', motivo: 'Motivo' }, null)).status).toBe(401);
    });

    it('RF-12: 403 para el alumno, aunque sea su expediente', async () => {
      const c = await caso();
      const res = await pedir('patch', `/${c.id}/estado`, { accion: 'CANCELAR', motivo: 'Motivo' }, await c.cookie());
      expect(res.status).toBe(403);
    });

    it('RN-03b: 403 para vinculación de otra oficina', async () => {
      const c = await caso({ tipo: 'PRACTICAS' });
      const res = await pedir('patch', `/${c.id}/estado`, { accion: 'SUSPENDER', motivo: 'Motivo' }, cookieServicio);
      expect(res.status).toBe(403);
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe('EN_PROCESO');
    });

    it('RF-12: 404 si el expediente es de otro plantel o no existe', async () => {
      const c = await caso();
      expect((await pedir('patch', `/${c.id}/estado`, { accion: 'SUSPENDER', motivo: 'Motivo' }, cookieOtroPlantel)).status).toBe(404);
      expect((await pedir('patch', `/${randomUUID()}/estado`, { accion: 'SUSPENDER', motivo: 'Motivo' })).status).toBe(404);
    });
  });

  describe('POST /api/expedientes/:id/transferir', () => {
    // A running case file with validated hours: 120 + 60 minutes, plus an unvalidated week and 30 already transferred.
    const conHoras = async (estado: EstadoExpediente = 'EN_PROCESO') => {
      const origen = await institucion();
      const supervisor = await crearSupervisor({ institucionId: origen.id });
      const c = await caso({ estado, semestre: 6, datos: { institucionId: origen.id, supervisorId: supervisor.id, minutosTransferidos: 30 } });
      await crearSemana({ expedienteId: c.id, semanaInicio: '2026-03-02', estado: 'VALIDADA', minutos: [120, 60] });
      await crearSemana({ expedienteId: c.id, semanaInicio: '2026-03-09', estado: 'ENVIADA', minutos: [100] });
      await crearSemana({ expedienteId: c.id, semanaInicio: '2026-03-16', estado: 'BORRADOR', minutos: [45] });
      return { ...c, origenId: origen.id };
    };

    it('RN-12: conservando las horas, el nuevo hereda los minutos validados más los ya transferidos', async () => {
      const c = await conHoras();
      const destino = await institucion();

      const res = await pedir('post', `/${c.id}/transferir`, { institucionId: destino.id, conservarHoras: true, motivo: 'Cierre de la empresa' });

      expect(res.status).toBe(201);
      expect(res.body.anterior).toMatchObject({ id: c.id, estado: 'CANCELADO' });
      expect(res.body.nuevo).toMatchObject({
        estado: 'PENDIENTE',
        tipo: 'PRACTICAS',
        semestre: 6,
        metaHoras: 240,
        minutosTransferidos: 210,
        institucion: { id: destino.id },
        supervisor: null,
      });
      expect(res.body.nuevo.id).not.toBe(c.id);
      const nuevo = await prisma.expediente.findUniqueOrThrow({ where: { id: res.body.nuevo.id } });
      expect(nuevo).toMatchObject({
        alumnoId: c.alumnoId,
        estado: 'PENDIENTE',
        supervisorId: null,
        minutosTransferidos: 210,
        motivoTransferencia: 'Cierre de la empresa',
      });
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe('CANCELADO');
    });

    it('RN-12: sin conservar las horas, el nuevo arranca en cero', async () => {
      const c = await conHoras();
      const destino = await institucion();

      const res = await pedir('post', `/${c.id}/transferir`, { institucionId: destino.id, conservarHoras: false, motivo: 'Mala experiencia' });

      expect(res.status).toBe(201);
      const nuevo = await prisma.expediente.findUniqueOrThrow({ where: { id: res.body.nuevo.id } });
      expect(nuevo.minutosTransferidos).toBe(0);
      expect(nuevo.motivoTransferencia).toBe('Mala experiencia');
    });

    it('RN-12: transferir un servicio social sin horas validadas conserva solo los ya transferidos', async () => {
      const c = await caso({ tipo: 'SERVICIO_SOCIAL', datos: { minutosTransferidos: 90 } });
      const destino = await institucion();

      const res = await pedir('post', `/${c.id}/transferir`, { institucionId: destino.id, conservarHoras: true, motivo: 'Motivo' }, cookieServicio);

      expect(res.status).toBe(201);
      expect(res.body.nuevo).toMatchObject({ tipo: 'SERVICIO_SOCIAL', metaHoras: 480, minutosTransferidos: 90 });
    });

    it('RN-12: también se transfiere un expediente suspendido', async () => {
      const c = await conHoras('SUSPENDIDO');
      const destino = await institucion();
      const res = await pedir('post', `/${c.id}/transferir`, { institucionId: destino.id, conservarHoras: true, motivo: 'Motivo' }, cookieAdmin);
      expect(res.status).toBe(201);
    });

    it('RN-12: audita la transferencia con el expediente anterior, el nuevo, las horas conservadas y el motivo', async () => {
      const c = await conHoras();
      const destino = await institucion();

      const res = await pedir('post', `/${c.id}/transferir`, { institucionId: destino.id, conservarHoras: true, motivo: 'Cierre' });

      const filas = await auditoria(c.id, 'TRANSFERIR_EXPEDIENTE');
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        entidad: 'Expediente',
        antes: { estado: 'EN_PROCESO', institucionId: c.origenId },
        despues: {
          expedienteNuevoId: res.body.nuevo.id,
          institucionId: destino.id,
          conservarHoras: true,
          minutosTransferidos: 210,
          motivo: 'Cierre',
        },
      });
    });

    it('RN-12: el expediente nuevo se confirma con el flujo de la 0012', async () => {
      const c = await conHoras();
      const destino = await institucion();
      const supervisor = await crearSupervisor({ institucionId: destino.id, datos: { confirmado: false } });
      const res = await pedir('post', `/${c.id}/transferir`, { institucionId: destino.id, conservarHoras: true, motivo: 'Motivo' });
      const nuevoId = res.body.nuevo.id as string;

      // Missing data until the student and the office complete it.
      expect((await pedir('post', `/${nuevoId}/confirmar`)).status).toBe(409);
      const campos = {
        supervisorId: supervisor.id,
        fechaInicio: '2026-04-06',
        fechaTermino: '2026-08-31',
        diasPactados: [1, 2],
        horaEntrada: '08:00',
        horaSalida: '12:00',
      };
      expect((await pedir('patch', `/${nuevoId}`, campos)).status).toBe(200);
      const confirmado = await pedir('post', `/${nuevoId}/confirmar`);

      expect(confirmado.status).toBe(200);
      expect(confirmado.body.expediente).toMatchObject({ estado: 'EN_PROCESO', minutosTransferidos: 210 });
    });

    it.each(['PENDIENTE', 'FINALIZADO', 'CANCELADO'] as const)('RN-12: 409 si el expediente está %s', async (estado) => {
      const c = await caso({ estado });
      const destino = await institucion();

      const res = await pedir('post', `/${c.id}/transferir`, { institucionId: destino.id, conservarHoras: true, motivo: 'Motivo' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('TRANSICION_NO_PERMITIDA');
      expect(await prisma.expediente.count({ where: { alumnoId: c.alumnoId } })).toBe(1);
    });

    it.each([
      ['no existe', async () => randomUUID()],
      ['es de otro plantel', async () => (await institucion({}, otroPlantelId)).id],
      ['está inactiva', async () => (await institucion({ activa: false })).id],
    ])('RN-12: 400 INSTITUCION_INVALIDA si la institución %s, sin tocar el expediente', async (_caso, crear) => {
      const c = await caso();

      const res = await pedir('post', `/${c.id}/transferir`, { institucionId: await crear(), conservarHoras: true, motivo: 'Motivo' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSTITUCION_INVALIDA');
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe('EN_PROCESO');
      expect(await prisma.expediente.count({ where: { alumnoId: c.alumnoId } })).toBe(1);
    });

    it('RN-12: 400 INSTITUCION_NO_ACEPTA_TIPO si la institución no recibe ese programa', async () => {
      const c = await caso({ tipo: 'PRACTICAS' });
      const destino = await institucion({ aceptaPracticas: false });

      const res = await pedir('post', `/${c.id}/transferir`, { institucionId: destino.id, conservarHoras: true, motivo: 'Motivo' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSTITUCION_NO_ACEPTA_TIPO');
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe('EN_PROCESO');
    });

    it('RN-12: 400 INSTITUCION_IGUAL si la institución es la actual', async () => {
      const origen = await institucion();
      const c = await caso({ datos: { institucionId: origen.id } });

      const res = await pedir('post', `/${c.id}/transferir`, { institucionId: origen.id, conservarHoras: true, motivo: 'Motivo' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSTITUCION_IGUAL');
    });

    it.each([
      ['falta la institución', () => ({ conservarHoras: true, motivo: 'Motivo' })],
      ['institución no uuid', () => ({ institucionId: 'abc', conservarHoras: true, motivo: 'Motivo' })],
      ['falta conservarHoras', (id: string) => ({ institucionId: id, motivo: 'Motivo' })],
      ['conservarHoras no booleano', (id: string) => ({ institucionId: id, conservarHoras: 'si', motivo: 'Motivo' })],
      ['falta el motivo', (id: string) => ({ institucionId: id, conservarHoras: true })],
      ['motivo vacío', (id: string) => ({ institucionId: id, conservarHoras: true, motivo: '  ' })],
      ['campo desconocido', (id: string) => ({ institucionId: id, conservarHoras: true, motivo: 'Motivo', minutosTransferidos: 9999 })],
    ])('RN-12: 400 si %s', async (_caso, armar) => {
      const c = await caso();
      const destino = await institucion();
      const body = armar(destino.id);

      const res = await pedir('post', `/${c.id}/transferir`, body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(await prisma.expediente.count({ where: { alumnoId: c.alumnoId } })).toBe(1);
    });

    it('RN-12: 400 si el id no es un uuid', async () => {
      const res = await pedir('post', '/no-es-uuid/transferir', { institucionId: randomUUID(), conservarHoras: true, motivo: 'Motivo' });
      expect(res.status).toBe(400);
    });

    it('RN-12: 401 sin sesión, 403 alumno, 403 otra oficina y 404 otro plantel', async () => {
      const c = await caso({ tipo: 'PRACTICAS' });
      const destino = await institucion();
      const body = { institucionId: destino.id, conservarHoras: true, motivo: 'Motivo' };

      expect((await pedir('post', `/${c.id}/transferir`, body, null)).status).toBe(401);
      expect((await pedir('post', `/${c.id}/transferir`, body, await c.cookie())).status).toBe(403);
      expect((await pedir('post', `/${c.id}/transferir`, body, cookieServicio)).status).toBe(403);
      expect((await pedir('post', `/${c.id}/transferir`, body, cookieOtroPlantel)).status).toBe(404);
      expect((await pedir('post', `/${randomUUID()}/transferir`, body)).status).toBe(404);
      expect((await prisma.expediente.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe('EN_PROCESO');
    });

    it('RN-12: dos transferencias simultáneas no crean dos expedientes nuevos', async () => {
      const c = await caso();
      const a = await institucion();
      const b = await institucion();

      const respuestas = await Promise.all([
        pedir('post', `/${c.id}/transferir`, { institucionId: a.id, conservarHoras: true, motivo: 'Uno' }),
        pedir('post', `/${c.id}/transferir`, { institucionId: b.id, conservarHoras: true, motivo: 'Dos' }),
      ]);

      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
      const activos = await prisma.expediente.count({ where: { alumnoId: c.alumnoId, estado: { in: ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'] } } });
      expect(activos).toBe(1);
      expect(await auditoria(c.id, 'TRANSFERIR_EXPEDIENTE')).toHaveLength(1);
    });
  });

  describe('POST /api/expedientes/asignar', () => {
    // A student who finished their first program and is in 6th semester.
    const egresado = (tipoPrimero: TipoPrograma = 'SERVICIO_SOCIAL', semestreAlumno = 6) =>
      caso({ tipo: tipoPrimero, estado: 'FINALIZADO', semestre: 5, semestreAlumno });

    it('RN-03a: asigna prácticas pendientes a quien finalizó servicio social', async () => {
      const c = await egresado('SERVICIO_SOCIAL');

      const res = await pedir('post', '/asignar', { alumnoIds: [c.alumnoId] }, cookieAdmin);

      expect(res.status).toBe(200);
      expect(res.body.omitidos).toEqual([]);
      expect(res.body.asignados).toHaveLength(1);
      expect(res.body.asignados[0]).toMatchObject({ alumnoId: c.alumnoId, tipo: 'PRACTICAS' });
      const nuevo = await prisma.expediente.findUniqueOrThrow({ where: { id: res.body.asignados[0].expedienteId } });
      expect(nuevo).toMatchObject({
        alumnoId: c.alumnoId,
        tipo: 'PRACTICAS',
        estado: 'PENDIENTE',
        semestre: 6,
        metaHoras: 240,
        minutosTransferidos: 0,
        institucionId: null,
        supervisorId: null,
      });
    });

    it('RN-03a: asigna servicio social (480 h) a quien finalizó prácticas', async () => {
      const c = await egresado('PRACTICAS');

      const res = await pedir('post', '/asignar', { alumnoIds: [c.alumnoId] }, cookieServicio);

      expect(res.status).toBe(200);
      expect(res.body.asignados[0]).toMatchObject({ alumnoId: c.alumnoId, tipo: 'SERVICIO_SOCIAL' });
      const nuevo = await prisma.expediente.findUniqueOrThrow({ where: { id: res.body.asignados[0].expedienteId } });
      expect(nuevo).toMatchObject({ tipo: 'SERVICIO_SOCIAL', metaHoras: 480, estado: 'PENDIENTE' });
    });

    it('RN-03a: audita ASIGNAR_PROGRAMA por cada expediente creado', async () => {
      const a = await egresado('SERVICIO_SOCIAL');
      const b = await egresado('SERVICIO_SOCIAL');

      const res = await pedir('post', '/asignar', { alumnoIds: [a.alumnoId, b.alumnoId] });

      expect(res.body.asignados).toHaveLength(2);
      for (const asignado of res.body.asignados as { expedienteId: string; tipo: string; alumnoId: string }[]) {
        const filas = await auditoria(asignado.expedienteId, 'ASIGNAR_PROGRAMA');
        expect(filas).toHaveLength(1);
        expect(filas[0]).toMatchObject({ entidad: 'Expediente', despues: { alumnoId: asignado.alumnoId, tipo: 'PRACTICAS', estado: 'PENDIENTE' } });
      }
    });

    it('RN-03a: omite con motivo al alumno cuyo primer expediente no está finalizado', async () => {
      const c = await caso({ tipo: 'SERVICIO_SOCIAL', estado: 'CANCELADO', semestreAlumno: 6 });
      const res = await pedir('post', '/asignar', { alumnoIds: [c.alumnoId] }, cookieAdmin);
      expect(res.body.asignados).toEqual([]);
      expect(res.body.omitidos).toEqual([{ alumnoId: c.alumnoId, motivo: expect.stringContaining('finalizado') }]);
    });

    it('RN-03: omite al alumno con un expediente activo', async () => {
      const c = await egresado('SERVICIO_SOCIAL');
      await crearExpediente({ alumnoId: c.alumnoId, tipo: 'SERVICIO_SOCIAL', estado: 'EN_PROCESO' });

      const res = await pedir('post', '/asignar', { alumnoIds: [c.alumnoId] }, cookieAdmin);

      expect(res.body.asignados).toEqual([]);
      expect(res.body.omitidos).toEqual([{ alumnoId: c.alumnoId, motivo: expect.stringContaining('activo') }]);
    });

    it('RN-03a: omite al alumno que ya finalizó el tipo contrario', async () => {
      const c = await egresado('SERVICIO_SOCIAL');
      await crearExpediente({ alumnoId: c.alumnoId, tipo: 'PRACTICAS', estado: 'FINALIZADO' });

      const res = await pedir('post', '/asignar', { alumnoIds: [c.alumnoId] }, cookieAdmin);

      expect(res.body.asignados).toEqual([]);
      expect(res.body.omitidos).toEqual([{ alumnoId: c.alumnoId, motivo: expect.stringContaining('otro programa') }]);
      expect(await prisma.expediente.count({ where: { alumnoId: c.alumnoId } })).toBe(2);
    });

    it('RN-03a: un expediente cancelado del tipo contrario no bloquea: se asigna uno nuevo', async () => {
      const c = await egresado('SERVICIO_SOCIAL');
      await crearExpediente({ alumnoId: c.alumnoId, tipo: 'PRACTICAS', estado: 'CANCELADO', semestre: 6 });

      const res = await pedir('post', '/asignar', { alumnoIds: [c.alumnoId] }, cookieAdmin);

      expect(res.body.omitidos).toEqual([]);
      expect(res.body.asignados).toEqual([expect.objectContaining({ alumnoId: c.alumnoId, tipo: 'PRACTICAS' })]);
      expect(await prisma.expediente.count({ where: { alumnoId: c.alumnoId, tipo: 'PRACTICAS', estado: 'PENDIENTE' } })).toBe(1);
    });

    it('RN-03a: omite al alumno de menos de 6.º semestre', async () => {
      const c = await egresado('SERVICIO_SOCIAL', 5);
      const res = await pedir('post', '/asignar', { alumnoIds: [c.alumnoId] }, cookieAdmin);
      expect(res.body.asignados).toEqual([]);
      expect(res.body.omitidos).toEqual([{ alumnoId: c.alumnoId, motivo: expect.stringContaining('semestre') }]);
    });

    it('RN-03a: omite al alumno inexistente y al de otro plantel', async () => {
      const ajeno = await caso({ tipo: 'SERVICIO_SOCIAL', estado: 'FINALIZADO', semestreAlumno: 6, plantel: otroPlantelId });
      const inexistente = randomUUID();

      const res = await pedir('post', '/asignar', { alumnoIds: [inexistente, ajeno.alumnoId] }, cookieAdmin);

      expect(res.status).toBe(200);
      expect(res.body.asignados).toEqual([]);
      expect(res.body.omitidos).toEqual([
        { alumnoId: inexistente, motivo: expect.stringContaining('no existe') },
        { alumnoId: ajeno.alumnoId, motivo: expect.stringContaining('no existe') },
      ]);
      expect(await prisma.expediente.count({ where: { alumnoId: ajeno.alumnoId } })).toBe(1);
    });

    it('RN-03b: vinculación solo asigna el tipo de su oficina; el resto se omite con motivo', async () => {
      const aPracticas = await egresado('SERVICIO_SOCIAL'); // next: PRACTICAS
      const aServicio = await egresado('PRACTICAS'); // next: SERVICIO_SOCIAL

      const res = await pedir('post', '/asignar', { alumnoIds: [aPracticas.alumnoId, aServicio.alumnoId] }, cookiePracticas);

      expect(res.status).toBe(200);
      expect(res.body.asignados).toEqual([expect.objectContaining({ alumnoId: aPracticas.alumnoId, tipo: 'PRACTICAS' })]);
      expect(res.body.omitidos).toEqual([{ alumnoId: aServicio.alumnoId, motivo: expect.stringContaining('oficina') }]);
      expect(await prisma.expediente.count({ where: { alumnoId: aServicio.alumnoId } })).toBe(1);
    });

    it('RN-03b: el admin asigna ambos tipos', async () => {
      const a = await egresado('SERVICIO_SOCIAL');
      const b = await egresado('PRACTICAS');

      const res = await pedir('post', '/asignar', { alumnoIds: [a.alumnoId, b.alumnoId] }, cookieAdmin);

      expect(res.body.asignados.map((x: { tipo: string }) => x.tipo).sort()).toEqual(['PRACTICAS', 'SERVICIO_SOCIAL']);
      expect(res.body.omitidos).toEqual([]);
    });

    it('RN-03a: un id repetido se procesa una sola vez', async () => {
      const c = await egresado('SERVICIO_SOCIAL');

      const res = await pedir('post', '/asignar', { alumnoIds: [c.alumnoId, c.alumnoId] }, cookieAdmin);

      expect(res.body.asignados).toHaveLength(1);
      expect(res.body.omitidos).toEqual([]);
      expect(await prisma.expediente.count({ where: { alumnoId: c.alumnoId } })).toBe(2);
    });

    it('RN-03: dos asignaciones simultáneas no crean dos expedientes', async () => {
      const c = await egresado('SERVICIO_SOCIAL');

      const respuestas = await Promise.all([
        pedir('post', '/asignar', { alumnoIds: [c.alumnoId] }, cookieAdmin),
        pedir('post', '/asignar', { alumnoIds: [c.alumnoId] }, cookieAdmin),
      ]);

      expect(respuestas.every((r) => r.status === 200)).toBe(true);
      expect(respuestas.reduce((n, r) => n + r.body.asignados.length, 0)).toBe(1);
      expect(await prisma.expediente.count({ where: { alumnoId: c.alumnoId } })).toBe(2);
    });

    it.each([
      ['falta alumnoIds', {}],
      ['lista vacía', { alumnoIds: [] }],
      ['ids que no son uuid', { alumnoIds: ['abc'] }],
      ['demasiados ids', { alumnoIds: Array.from({ length: 501 }, () => randomUUID()) }],
      ['campo desconocido', { alumnoIds: [randomUUID()], tipo: 'PRACTICAS' }],
    ])('RN-03a: 400 si %s', async (_caso, body) => {
      const res = await pedir('post', '/asignar', body, cookieAdmin);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('RN-03a: 401 sin sesión y 403 para el alumno', async () => {
      const c = await egresado('SERVICIO_SOCIAL');
      expect((await pedir('post', '/asignar', { alumnoIds: [c.alumnoId] }, null)).status).toBe(401);
      expect((await pedir('post', '/asignar', { alumnoIds: [c.alumnoId] }, await c.cookie())).status).toBe(403);
      expect(await prisma.expediente.count({ where: { alumnoId: c.alumnoId } })).toBe(1);
    });
  });
});
