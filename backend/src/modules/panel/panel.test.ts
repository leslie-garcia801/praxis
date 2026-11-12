import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { obtenerAvance } from '../expedientes/expedientes.service.js';
import { listarPanelAlumnos } from './panel.service.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;

// Local time 12:00 (America/Monterrey, UTC-6 in May) on Wednesday 2026-05-20.
const AHORA = new Date('2026-05-20T18:00:00.000Z');
const ahora = () => AHORA;
const HOY = '2026-05-20';
const dia = (fecha: string, hora = '15:00') => new Date(`${fecha}T${hora}:00.000Z`);
const fechaDB = (f: string) => new Date(`${f}T00:00:00.000Z`);
// Calendar day `dias` before today (negative: after today).
const hace = (dias: number) => {
  const d = new Date(`${HOY}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
};

const aAuthUser = (u: Awaited<ReturnType<typeof crearUsuario>>): AuthUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  username: u.username,
  plantelId: u.plantelId,
  rol: u.rol,
  oficina: u.oficina,
  debeCambiar: u.debeCambiar,
  activo: u.activo,
});

type OpcionesCaso = {
  tipo?: 'SERVICIO_SOCIAL' | 'PRACTICAS';
  estado?: 'PENDIENTE' | 'EN_PROCESO' | 'SUSPENDIDO' | 'FINALIZADO' | 'CANCELADO';
  plantel?: string;
  fechaInicio?: string | null;
  datos?: Parameters<typeof crearExpediente>[0]['datos'];
  alumno?: { nombre?: string; apellidoPaterno?: string };
  institucion?: string | null;
};

describe('panel de vinculación', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let vinculacionPracticas: AuthUser;
  let vinculacionServicio: AuthUser;
  let admin: AuthUser;
  let cookieServicio: string;
  let cookieAlumno: string;
  let institucionId: string;
  let matriculas = 0;

  // A student with a case file (EN_PROCESO by default).
  async function crearCaso(plantelPorDefecto: string, institucionPorDefecto: string | null, opciones: OpcionesCaso = {}) {
    matriculas++;
    const alumnoUser = await crearAlumnoPrecargado({
      plantelId: opciones.plantel ?? plantelPorDefecto,
      matricula: `${Date.now()}${matriculas}`.padStart(14, '0').slice(-14),
      ...opciones.alumno,
    });
    const expediente = await crearExpediente({
      alumnoId: alumnoUser.alumno!.id,
      tipo: opciones.tipo ?? 'SERVICIO_SOCIAL',
      estado: opciones.estado ?? 'EN_PROCESO',
      institucionId: opciones.institucion === undefined ? institucionPorDefecto : opciones.institucion,
      fechaInicio: opciones.fechaInicio === undefined ? fechaDB(hace(60)) : opciones.fechaInicio ? fechaDB(opciones.fechaInicio) : null,
      datos: opciones.datos,
    });
    return { alumnoUser, alumno: alumnoUser.alumno!, expediente };
  }
  const caso = (opciones: OpcionesCaso = {}) => crearCaso(plantelId, institucionId, opciones);

  // `n` days with `minutos` each, starting `desdeHace` days ago and going back, as unassigned closed shifts.
  async function registrarDias(expedienteId: string, n: number, minutos: number, desdeHace = 1) {
    for (let i = 0; i < n; i++) {
      await crearAsistencia({ expedienteId, entrada: dia(hace(desdeHace + i)), minutos });
    }
  }

  const pedir = (cookie: string | null, query = '') => {
    const req = request(app).get(`/api/panel/alumnos${query}`).set('Origin', ORIGIN);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  const filas = async (user: AuthUser, query: Parameters<typeof listarPanelAlumnos>[1] = {}) =>
    (await listarPanelAlumnos(user, query, ahora)).alumnos;
  const ids = (lista: { expediente: { id: string } }[]) => lista.map((f) => f.expediente.id);

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    const uServicio = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' });
    vinculacionServicio = aAuthUser(uServicio);
    vinculacionPracticas = aAuthUser(await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' }));
    admin = aAuthUser(await crearUsuario({ plantelId, rol: 'ADMIN' }));
    cookieServicio = await iniciarSesion(app, uServicio);
    cookieAlumno = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ALUMNO', username: `al${randomUUID().slice(0, 8)}` }));
    institucionId = (await crearInstitucion({ plantelId })).id;
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  describe('GET /api/panel/alumnos', () => {
    it('returns the rows with alumno, progress and alertas for vinculación', async () => {
      const { expediente } = await caso();
      const res = await pedir(cookieServicio);

      expect(res.status).toBe(200);
      const fila = res.body.alumnos.find((f: { expediente: { id: string } }) => f.expediente.id === expediente.id);
      expect(Object.keys(fila).sort()).toEqual(
        [
          'alumno',
          'expediente',
          'fechaEstimada',
          'institucion',
          'limite',
          'metaMinutos',
          'minutosRegistrados',
          'minutosValidados',
          'porcentaje',
          'riesgo',
          'semanasPendientes',
          'ultimoRegistro',
        ].sort(),
      );
      expect(Object.keys(res.body.alertas).sort()).toEqual(['semanasSinValidar', 'sinRegistros', 'supervisoresSinConfirmar', 'turnosIncompletos']);
    });

    it('returns 401 without a session', async () => {
      expect((await pedir(null)).status).toBe(401);
    });

    it('returns 403 for alumno', async () => {
      expect((await pedir(cookieAlumno)).status).toBe(403);
    });

    it.each(['?estado=NADA', '?semestre=abc', '?semestre=0', '?carreraId=no-uuid', '?institucionId=x', '?turno=NOCTURNO', '?tipo=OTRO', '?riesgo=EN_TIEMPO'])(
      'returns 400 for the invalid filter %s',
      async (query) => {
        const res = await pedir(cookieServicio, query);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      },
    );

    it('RN-03b: returns 403 when the tipo filter is outside the office scope', async () => {
      expect((await pedir(cookieServicio, '?tipo=PRACTICAS')).status).toBe(403);
      expect((await pedir(cookieServicio, '?tipo=SERVICIO_SOCIAL')).status).toBe(200);
    });
  });

  describe('alcance (RN-03b)', () => {
    it('RN-03b: vinculación de prácticas no ve expedientes de servicio social', async () => {
      const servicio = await caso({ tipo: 'SERVICIO_SOCIAL' });
      const practicas = await caso({ tipo: 'PRACTICAS', datos: { fechaTermino: fechaDB(hace(-30)) } });

      const deServicio = ids(await filas(vinculacionServicio));
      expect(deServicio).toContain(servicio.expediente.id);
      expect(deServicio).not.toContain(practicas.expediente.id);

      const dePracticas = ids(await filas(vinculacionPracticas));
      expect(dePracticas).toContain(practicas.expediente.id);
      expect(dePracticas).not.toContain(servicio.expediente.id);
    });

    it('RN-03b: admin ve ambos tipos y puede filtrar por tipo', async () => {
      const servicio = await caso({ tipo: 'SERVICIO_SOCIAL' });
      const practicas = await caso({ tipo: 'PRACTICAS' });

      const todos = ids(await filas(admin));
      expect(todos).toEqual(expect.arrayContaining([servicio.expediente.id, practicas.expediente.id]));

      const soloPracticas = ids(await filas(admin, { tipo: 'PRACTICAS' }));
      expect(soloPracticas).toContain(practicas.expediente.id);
      expect(soloPracticas).not.toContain(servicio.expediente.id);
    });

    it('RN-03b: un tipo fuera del alcance es 403', async () => {
      await expect(filas(vinculacionServicio, { tipo: 'PRACTICAS' })).rejects.toMatchObject({ status: 403 });
    });

    it('RN-03b: un alumno de otro plantel no aparece', async () => {
      const ajeno = await caso({ plantel: otroPlantelId, institucion: null });
      expect(ids(await filas(admin))).not.toContain(ajeno.expediente.id);
    });
  });

  describe('filtros (RF-23)', () => {
    it('filters by carreraId, semestre, grupo and turno', async () => {
      const a = await caso();
      const b = await caso();
      await prisma.alumno.update({ where: { id: b.alumno.id }, data: { semestre: 6, grupo: 'Z', turno: 'VESPERTINO' } });

      expect(ids(await filas(admin, { carreraId: a.alumno.carreraId }))).toEqual([a.expediente.id]);
      expect(ids(await filas(admin, { semestre: 6 }))).toEqual([b.expediente.id]);
      expect(ids(await filas(admin, { grupo: 'Z' }))).toEqual([b.expediente.id]);
      expect(ids(await filas(admin, { turno: 'VESPERTINO' }))).toEqual([b.expediente.id]);
      const combinado = ids(await filas(admin, { semestre: 5, grupo: 'A', turno: 'MATUTINO' }));
      expect(combinado).toContain(a.expediente.id);
      expect(combinado).not.toContain(b.expediente.id);
    });

    it('filters by estado: default EN_PROCESO and SUSPENDIDO, TODOS includes every state', async () => {
      const enProceso = await caso({ estado: 'EN_PROCESO' });
      const suspendido = await caso({ estado: 'SUSPENDIDO' });
      const pendiente = await caso({ estado: 'PENDIENTE' });
      const finalizado = await caso({ estado: 'FINALIZADO' });
      const cancelado = await caso({ estado: 'CANCELADO' });

      const porDefecto = ids(await filas(admin));
      expect(porDefecto).toEqual(expect.arrayContaining([enProceso.expediente.id, suspendido.expediente.id]));
      for (const otro of [pendiente, finalizado, cancelado]) expect(porDefecto).not.toContain(otro.expediente.id);

      const soloFinalizados = ids(await filas(admin, { estado: 'FINALIZADO' }));
      expect(soloFinalizados).toContain(finalizado.expediente.id);
      expect(soloFinalizados).not.toContain(enProceso.expediente.id);

      const todos = ids(await filas(admin, { estado: 'TODOS' }));
      expect(todos).toEqual(expect.arrayContaining([enProceso, suspendido, pendiente, finalizado, cancelado].map((c) => c.expediente.id)));
    });

    it('filters by institucionId', async () => {
      const otra = await crearInstitucion({ plantelId, nombre: 'Otra institución' });
      const enOtra = await caso({ institucion: otra.id });
      const sinInstitucion = await caso({ institucion: null });

      expect(ids(await filas(admin, { institucionId: otra.id }))).toEqual([enOtra.expediente.id]);
      const todos = await filas(admin);
      expect(todos.find((f) => f.expediente.id === sinInstitucion.expediente.id)?.institucion).toBeNull();
    });

    it('RN-06a: riesgo=EN_RIESGO keeps only the students at risk and they go first', async () => {
      const normal = await caso({ alumno: { apellidoPaterno: 'Aaa' } });
      const enRiesgo = await caso({ alumno: { apellidoPaterno: 'Zzz' }, fechaInicio: hace(200) });

      const todos = ids(await filas(admin));
      expect(todos.indexOf(enRiesgo.expediente.id)).toBeLessThan(todos.indexOf(normal.expediente.id));
      const soloRiesgo = await filas(admin, { riesgo: 'EN_RIESGO' });
      expect(ids(soloRiesgo)).toContain(enRiesgo.expediente.id);
      expect(ids(soloRiesgo)).not.toContain(normal.expediente.id);
      expect(soloRiesgo.every((f) => f.riesgo === 'EN_RIESGO')).toBe(true);
    });

    it('orders by apellido within the same risk level', async () => {
      const otra = await crearInstitucion({ plantelId, nombre: 'Orden' });
      const b = await caso({ alumno: { apellidoPaterno: 'Bbb' }, institucion: otra.id });
      const a = await caso({ alumno: { apellidoPaterno: 'Aaa' }, institucion: otra.id });
      expect(ids(await filas(admin, { institucionId: otra.id }))).toEqual([a.expediente.id, b.expediente.id]);
    });
  });

  describe('columnas y consistencia con obtenerAvance', () => {
    it('matches obtenerAvance for validated, rejected, unassigned weeks and transferred minutes', async () => {
      // Validated week + transferred minutes + a sent week + an unassigned shift.
      const conValidada = await caso({ datos: { minutosTransferidos: 600 } });
      await crearSemana({ expedienteId: conValidada.expediente.id, semanaInicio: '2026-04-06', estado: 'VALIDADA', minutos: [300, 360, 240] });
      await crearSemana({ expedienteId: conValidada.expediente.id, semanaInicio: '2026-04-13', estado: 'ENVIADA', minutos: [200, 200] });
      await crearAsistencia({ expedienteId: conValidada.expediente.id, entrada: dia('2026-05-18'), minutos: 120 });

      // Rejected week and a draft.
      const conRechazada = await caso();
      await crearSemana({ expedienteId: conRechazada.expediente.id, semanaInicio: '2026-05-04', estado: 'RECHAZADA', minutos: [360, 360, 360, 360, 360, 360] });
      await crearSemana({ expedienteId: conRechazada.expediente.id, semanaInicio: '2026-05-11', estado: 'BORRADOR', minutos: [100, 100, 100, 100, 100, 100] });

      // Only unassigned shifts, plus an open shift and an INCOMPLETA one.
      const soloSueltas = await caso({ tipo: 'PRACTICAS', datos: { fechaTermino: fechaDB('2026-08-01') } });
      await registrarDias(soloSueltas.expediente.id, 7, 240, 2);
      await crearAsistencia({ expedienteId: soloSueltas.expediente.id, entrada: dia('2026-05-19'), estado: 'INCOMPLETA', minutos: 30, minutosAcreditables: null });
      await crearAsistencia({ expedienteId: soloSueltas.expediente.id, entrada: dia('2026-05-20', '14:00') });

      const vacio = await caso();

      const lista = await filas(admin);
      for (const c of [conValidada, conRechazada, soloSueltas, vacio]) {
        const fila = lista.find((f) => f.expediente.id === c.expediente.id)!;
        const avance = await obtenerAvance(admin, c.expediente.id, ahora);
        expect(fila.minutosValidados, 'validados').toBe(avance.minutosValidados);
        expect(fila.minutosRegistrados, 'registrados').toBe(avance.minutosRegistrados);
        expect(fila.metaMinutos).toBe(avance.metaMinutos);
        expect(fila.porcentaje).toBe(avance.porcentaje);
        expect(fila.fechaEstimada).toBe(avance.fechaEstimada.tipo === 'ESTIMADA' ? avance.fechaEstimada.fecha : null);
      }
      // Sanity: the scenarios are not all zeros.
      expect(lista.find((f) => f.expediente.id === conValidada.expediente.id)!.minutosValidados).toBe(600 + 900);
    });

    it('returns ultimoRegistro and the number of weeks awaiting validation', async () => {
      const c = await caso();
      await crearAsistencia({ expedienteId: c.expediente.id, entrada: dia('2026-05-10'), minutos: 120 });
      await crearAsistencia({ expedienteId: c.expediente.id, entrada: dia('2026-05-15', '14:00'), minutos: 60 });
      await crearSemana({ expedienteId: c.expediente.id, semanaInicio: '2026-04-06', estado: 'ENVIADA' });
      await crearSemana({ expedienteId: c.expediente.id, semanaInicio: '2026-04-13', estado: 'ENVIADA' });
      await crearSemana({ expedienteId: c.expediente.id, semanaInicio: '2026-04-20', estado: 'VALIDADA' });

      const fila = (await filas(admin)).find((f) => f.expediente.id === c.expediente.id)!;
      expect(new Date(fila.ultimoRegistro!).toISOString()).toBe('2026-05-15T14:00:00.000Z');
      expect(fila.semanasPendientes).toBe(2);
    });

    it('shows nombre completo, matrícula, carrera and the alumno columns', async () => {
      const c = await caso({ alumno: { nombre: 'Luis Enrique', apellidoPaterno: 'Pérez' } });
      const fila = (await filas(admin)).find((f) => f.expediente.id === c.expediente.id)!;
      expect(fila.alumno).toMatchObject({
        id: c.alumno.id,
        nombre: 'Luis Enrique Pérez García',
        matricula: c.alumnoUser.username,
        semestre: 5,
        grupo: 'A',
        turno: 'MATUTINO',
      });
      expect(fila.alumno.carrera).toContain('Carrera de prueba');
      expect(fila.institucion).toEqual({ id: institucionId, nombre: 'Institución de prueba' });
    });

    it('RN-15: groups minutes by local day to estimate the end date', async () => {
      // 23:30 local on May 14 is 05:30 UTC on May 15: it must count on May 14, like obtenerAvance does.
      const c = await caso();
      for (const fecha of ['2026-05-10', '2026-05-11', '2026-05-12', '2026-05-13']) {
        await crearAsistencia({ expedienteId: c.expediente.id, entrada: dia(fecha), minutos: 240 });
      }
      await crearAsistencia({ expedienteId: c.expediente.id, entrada: new Date('2026-05-15T05:30:00.000Z'), minutos: 60 });
      await crearAsistencia({ expedienteId: c.expediente.id, entrada: dia('2026-05-14'), minutos: 60 });

      const fila = (await filas(admin)).find((f) => f.expediente.id === c.expediente.id)!;
      const avance = await obtenerAvance(admin, c.expediente.id, ahora);
      expect(avance.fechaEstimada.tipo).toBe('ESTIMADA');
      expect(fila.fechaEstimada).toBe(avance.fechaEstimada.tipo === 'ESTIMADA' ? avance.fechaEstimada.fecha : null);
    });
  });

  describe('en riesgo (RN-06a)', () => {
    const filaDe = async (id: string) => (await filas(admin, { estado: 'TODOS' })).find((f) => f.expediente.id === id)!;

    it('RN-06a: en riesgo si la fecha estimada pasa el límite', async () => {
      // Prácticas ends in 20 days; 7 days of 60 min => pace of 60 min/day, 240 h needs far more than 20 days.
      const c = await caso({ tipo: 'PRACTICAS', fechaInicio: hace(8), datos: { fechaTermino: fechaDB(hace(-20)) } });
      await registrarDias(c.expediente.id, 7, 60);
      const fila = await filaDe(c.expediente.id);
      expect(fila.riesgo).toBe('EN_RIESGO');
      expect(fila.limite).toBe(hace(-20));
    });

    it('RN-06a: en tiempo si la fecha estimada cae dentro del límite', async () => {
      // 7 days of 390 min: about 36 days remain at that pace; the limit is 60 days away.
      const c = await caso({ tipo: 'PRACTICAS', fechaInicio: hace(8), datos: { fechaTermino: fechaDB(hace(-60)) } });
      await registrarDias(c.expediente.id, 7, 390);
      expect((await filaDe(c.expediente.id)).riesgo).toBe('EN_TIEMPO');
    });

    it('RN-06a: en riesgo si el límite ya pasó y no terminó', async () => {
      const c = await caso({ tipo: 'PRACTICAS', fechaInicio: hace(100), datos: { fechaTermino: fechaDB(hace(1)) } });
      expect((await filaDe(c.expediente.id)).riesgo).toBe('EN_RIESGO');
    });

    it('RN-06a: servicio social usa fechaInicio más 6 meses como límite', async () => {
      // Started 2025-12-01: the limit is 2026-06-01, 12 days away, at a pace of 60 min/day.
      const cerca = await caso({ fechaInicio: '2025-12-01' });
      await registrarDias(cerca.expediente.id, 7, 60);
      const filaCerca = await filaDe(cerca.expediente.id);
      expect(filaCerca.limite).toBe('2026-06-01');
      expect(filaCerca.riesgo).toBe('EN_RIESGO');

      // Started 2025-10-31: the limit 2026-04-30 (clamped month end) already passed.
      const vencido = await caso({ fechaInicio: '2025-10-31' });
      const filaVencido = await filaDe(vencido.expediente.id);
      expect(filaVencido.limite).toBe('2026-04-30');
      expect(filaVencido.riesgo).toBe('EN_RIESGO');
    });

    it('RN-16: con menos de 5 días registrados es sin datos, no en riesgo', async () => {
      const c = await caso({ tipo: 'PRACTICAS', fechaInicio: hace(8), datos: { fechaTermino: fechaDB(hace(-20)) } });
      await registrarDias(c.expediente.id, 4, 60);
      expect((await filaDe(c.expediente.id)).riesgo).toBe('SIN_DATOS');
    });

    it('RN-06a: no evaluable sin fecha de inicio o, en prácticas, sin fecha de término', async () => {
      const sinInicio = await caso({ fechaInicio: null });
      const sinTermino = await caso({ tipo: 'PRACTICAS', fechaInicio: hace(8) });
      expect((await filaDe(sinInicio.expediente.id)).riesgo).toBe('NO_EVALUABLE');
      expect((await filaDe(sinTermino.expediente.id)).riesgo).toBe('NO_EVALUABLE');
    });

    it('RN-11: completado cuando las horas validadas llegan a la meta', async () => {
      const c = await caso({
        tipo: 'PRACTICAS',
        fechaInicio: hace(100),
        datos: { fechaTermino: fechaDB(hace(1)), minutosTransferidos: 240 * 60 },
      });
      const fila = await filaDe(c.expediente.id);
      expect(fila.riesgo).toBe('COMPLETADO');
      expect(fila.porcentaje).toBe(100);
    });
  });

  describe('alertas (RF-24)', () => {
    // Alerts count the whole office: a dedicated plantel keeps the other tests' data out of the totals.
    let plantelAlertas: string;
    let adminAlertas: AuthUser;
    let institucionAlertas: string;

    beforeAll(async () => {
      plantelAlertas = (await crearPlantel()).id;
      adminAlertas = aAuthUser(await crearUsuario({ plantelId: plantelAlertas, rol: 'ADMIN' }));
      institucionAlertas = (await crearInstitucion({ plantelId: plantelAlertas, nombre: 'Alertas' })).id;
    });

    afterAll(async () => {
      await borrarPlantel(plantelAlertas);
    });

    // Each alert test starts from an empty office.
    const casoA = (opciones: OpcionesCaso = {}) => crearCaso(plantelAlertas, institucionAlertas, opciones);
    const alertas = async (query: Parameters<typeof listarPanelAlumnos>[1] = {}) =>
      (await listarPanelAlumnos(adminAlertas, query, ahora)).alertas;
    const limpiar = async () => {
      const expedientes = await prisma.expediente.findMany({ where: { alumno: { usuario: { plantelId: plantelAlertas } } }, select: { id: true } });
      const expedienteIds = expedientes.map((e) => e.id);
      await prisma.asistencia.deleteMany({ where: { expedienteId: { in: expedienteIds } } });
      await prisma.semanaBitacora.deleteMany({ where: { expedienteId: { in: expedienteIds } } });
      await prisma.expediente.deleteMany({ where: { id: { in: expedienteIds } } });
    };

    it('RF-24: students EN_PROCESO without records in 7 days, including those who never registered', async () => {
      await limpiar();
      const sinRegistros = await casoA();
      await crearAsistencia({ expedienteId: sinRegistros.expediente.id, entrada: dia(hace(8)), minutos: 120 });
      const activo = await casoA();
      await crearAsistencia({ expedienteId: activo.expediente.id, entrada: dia(hace(2)), minutos: 120 });
      const nuncaRegistro = await casoA({ fechaInicio: hace(10) });
      const recienIniciado = await casoA({ fechaInicio: hace(2) });
      const suspendido = await casoA({ estado: 'SUSPENDIDO' });
      const pendiente = await casoA({ estado: 'PENDIENTE', fechaInicio: hace(30) });

      const { sinRegistros: alerta } = await alertas();
      expect([...alerta.expedienteIds].sort()).toEqual([sinRegistros.expediente.id, nuncaRegistro.expediente.id].sort());
      expect(alerta.total).toBe(2);
      for (const otro of [activo, recienIniciado, suspendido, pendiente]) expect(alerta.expedienteIds).not.toContain(otro.expediente.id);
    });

    it('RN-18: alerta de semanas sin validar en más de 7 días', async () => {
      await limpiar();
      const marcar = async (expedienteId: string, estado: 'ENVIADA' | 'VALIDADA', diasAtras: number) => {
        const semana = await crearSemana({ expedienteId, semanaInicio: '2026-04-06', estado });
        await prisma.semanaBitacora.update({ where: { id: semana.id }, data: { enviadaEn: new Date(AHORA.getTime() - diasAtras * 86_400_000) } });
      };
      const vieja = await casoA();
      await marcar(vieja.expediente.id, 'ENVIADA', 8);
      const reciente = await casoA();
      await marcar(reciente.expediente.id, 'ENVIADA', 3);
      const validada = await casoA();
      await marcar(validada.expediente.id, 'VALIDADA', 20);

      const { semanasSinValidar } = await alertas();
      expect(semanasSinValidar.expedienteIds).toEqual([vieja.expediente.id]);
      expect(semanasSinValidar.total).toBe(1);
    });

    it('RF-24: turnos INCOMPLETA', async () => {
      await limpiar();
      const con = await casoA();
      await crearAsistencia({ expedienteId: con.expediente.id, entrada: dia(hace(3)), estado: 'INCOMPLETA', minutos: 30, minutosAcreditables: null });
      await crearAsistencia({ expedienteId: con.expediente.id, entrada: dia(hace(4)), estado: 'INCOMPLETA', minutos: 30, minutosAcreditables: null });
      const sin = await casoA();
      await crearAsistencia({ expedienteId: sin.expediente.id, entrada: dia(hace(3)), minutos: 120 });

      const { turnosIncompletos } = await alertas();
      expect(turnosIncompletos.expedienteIds).toEqual([con.expediente.id]);
      expect(turnosIncompletos.total).toBe(2);
    });

    it('RF-24: supervisores sin confirmar of the office case files', async () => {
      await limpiar();
      const sinConfirmar = await crearSupervisor({ institucionId: institucionAlertas, datos: { confirmado: false, nombre: 'Marta' } });
      const confirmado = await crearSupervisor({ institucionId: institucionAlertas, datos: { confirmado: true } });
      const a = await casoA({ estado: 'PENDIENTE', datos: { supervisorId: sinConfirmar.id } });
      const b = await casoA({ estado: 'PENDIENTE', datos: { supervisorId: sinConfirmar.id } });
      await casoA({ estado: 'EN_PROCESO', datos: { supervisorId: confirmado.id } });

      const { supervisoresSinConfirmar } = await alertas();
      expect(supervisoresSinConfirmar.total).toBe(1);
      expect(supervisoresSinConfirmar.supervisores).toEqual([
        {
          id: sinConfirmar.id,
          nombre: 'Marta Mendoza',
          institucion: { id: institucionAlertas, nombre: 'Alertas' },
          expedienteIds: [a.expediente.id, b.expediente.id].sort(),
        },
      ]);
    });

    it('RF-24: alerts count the whole office, not the filters', async () => {
      await limpiar();
      const c = await casoA();
      await crearAsistencia({ expedienteId: c.expediente.id, entrada: dia(hace(10)), minutos: 120 });

      const sinFiltros = await alertas();
      const filtrado = await alertas({ semestre: 12, estado: 'FINALIZADO' });
      expect(filtrado).toEqual(sinFiltros);
      expect(sinFiltros.sinRegistros.expedienteIds).toContain(c.expediente.id);
    });

    it('RN-03b: a vinculación office only counts alerts of its own tipo', async () => {
      await limpiar();
      const practicas = await casoA({ tipo: 'PRACTICAS', datos: { fechaTermino: fechaDB(hace(-30)) }, fechaInicio: hace(40) });
      const servicio = await casoA({ tipo: 'SERVICIO_SOCIAL', fechaInicio: hace(40) });
      const oficinaPracticas = aAuthUser(await crearUsuario({ plantelId: plantelAlertas, rol: 'VINCULACION', oficina: 'PRACTICAS' }));

      const { alertas: a } = await listarPanelAlumnos(oficinaPracticas, {}, ahora);
      expect(a.sinRegistros.expedienteIds).toContain(practicas.expediente.id);
      expect(a.sinRegistros.expedienteIds).not.toContain(servicio.expediente.id);
    });
  });
});
