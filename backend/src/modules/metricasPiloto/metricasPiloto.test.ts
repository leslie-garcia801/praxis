import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearAsistencia,
  crearExpediente,
  crearPlantel,
} from '../../../test/factories.js';
import type { EstadoAsistencia, EstadoExpediente, EstadoValidacion, TipoPrograma } from '../../generated/prisma/enums.js';
import { prisma } from '../../lib/prisma.js';
import { instanteLocal } from '../../lib/tiempo.js';
import { formatearCsv, formatearReporte } from './metricasPiloto.formato.js';
import type { ArgsMetricas } from './metricasPiloto.args.js';
import { ErrorUsoMetricas, generarReportePiloto } from './metricasPiloto.service.js';

// Range: Monday 2026-11-02 to Sunday 2026-11-15 (two full weeks). "Today" is Friday 2026-11-20.
const RANGO = { desde: '2026-11-02', hasta: '2026-11-15' };
const AHORA = instanteLocal('2026-11-20', '12:00');
const HORA = 3_600_000;

describe('Piloto §12: reporte de métricas del piloto (RN-08, RN-15, RN-18, RNF-07)', () => {
  let plantelId: string;
  let contador = 0;

  beforeEach(async () => {
    plantelId = (await crearPlantel()).id;
  });

  afterEach(async () => {
    await borrarPlantel(plantelId);
  });

  async function carrera(nombre: string) {
    return prisma.carrera.create({ data: { nombre: `Carrera de prueba ${nombre} ${randomUUID()}` } });
  }

  type AlumnoOpts = {
    plantel?: string;
    carreraId?: string;
    semestre?: number;
    grupo?: string;
    tipo?: TipoPrograma;
    estado?: EstadoExpediente;
    fechaInicio?: string | null;
    fechaTermino?: string | null;
    nombre?: string;
  };

  // A student with one case file.
  async function alumno({
    plantel = plantelId,
    carreraId,
    semestre = 5,
    grupo = 'A',
    tipo = 'SERVICIO_SOCIAL',
    estado = 'EN_PROCESO',
    fechaInicio = '2026-11-01',
    fechaTermino,
    nombre = 'Ana',
  }: AlumnoOpts = {}) {
    contador++;
    const usuario = await crearAlumnoPrecargado({ plantelId: plantel, matricula: `2531907398${String(contador).padStart(4, '0')}`, nombre });
    await prisma.alumno.update({ where: { id: usuario.alumno!.id }, data: { semestre, grupo, ...(carreraId && { carreraId }) } });
    const expediente = await crearExpediente({
      alumnoId: usuario.alumno!.id,
      tipo,
      estado,
      fechaInicio: fechaInicio ? new Date(`${fechaInicio}T00:00:00.000Z`) : null,
      datos: { fechaTermino: fechaTermino ? new Date(`${fechaTermino}T00:00:00.000Z`) : null },
    });
    return { usuario, expediente };
  }

  const turno = (expedienteId: string, fecha: string, hora = '09:00', estado: EstadoAsistencia = 'CERRADA', origen: 'QR' | 'LIBRETA' = 'QR') =>
    crearAsistencia({
      origen,
      expedienteId,
      entrada: instanteLocal(fecha, hora),
      ...(estado === 'ABIERTA' ? {} : { minutos: 240 }),
      estado,
    });

  async function semanaEnviada(expedienteId: string, semanaInicio: string, estado: EstadoValidacion, enviadaEn: Date, validadoEn: Date | null = null) {
    return prisma.semanaBitacora.create({
      data: { expedienteId, semanaInicio: new Date(`${semanaInicio}T00:00:00.000Z`), estado, enviadaEn, validadoEn },
    });
  }

  const generar = (extra: Partial<ArgsMetricas> = {}, ahora = AHORA) => generarReportePiloto({ ...RANGO, plantel: plantelId, ...extra }, ahora);

  describe('métrica 1: registro de al menos 4 días por semana', () => {
    it('Piloto §12: calcula días por alumno-semana y lista a los alumnos con menos de 4 días', async () => {
      const a = await alumno({ nombre: 'Ana' });
      const b = await alumno({ nombre: 'Beto' });
      // Week 1 (11-02): Ana 4 days, Beto 3 days. Week 2 (11-09): Ana 5 days (two shifts one day), Beto 0.
      for (const f of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) await turno(a.expediente.id, f);
      for (const f of ['2026-11-02', '2026-11-03', '2026-11-04']) await turno(b.expediente.id, f);
      for (const f of ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']) await turno(a.expediente.id, f);
      await turno(a.expediente.id, '2026-11-13', '15:00');

      const r = await generar();

      expect(r.expedientes).toBe(2);
      expect(r.alumnos).toBe(2);
      expect(r.registro.metrica).toMatchObject({ numerador: 2, denominador: 4, porcentaje: 50, cumple: false });
      expect(r.registro.semanas.map((s) => [s.semana, s.cumplen, s.total])).toEqual([
        ['2026-11-02', 1, 2],
        ['2026-11-09', 1, 2],
      ]);
      expect(r.registro.semanas[0]!.bajo).toEqual([expect.objectContaining({ alumno: expect.stringContaining('Beto'), dias: 3 })]);
      expect(r.registro.semanas[1]!.bajo).toEqual([expect.objectContaining({ alumno: expect.stringContaining('Beto'), dias: 0 })]);
    });

    it('Piloto §12: las asistencias fuera del rango no cuentan y la semana parcial queda fuera', async () => {
      const a = await alumno();
      for (const f of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) await turno(a.expediente.id, f);
      // Range ending on Saturday: week 2 (11-09..11-15) is no longer complete.
      const r = await generar({ hasta: '2026-11-14' });
      expect(r.registro.metrica).toMatchObject({ numerador: 1, denominador: 1 });
      // Days outside the range are ignored in the shift counts as well.
      await turno(a.expediente.id, '2026-10-30');
      await turno(a.expediente.id, '2026-11-16');
      const r2 = await generar();
      expect(r2.turnos.cerrados).toBe(4);
    });

    it('Piloto §12: fechaInicio a mitad de semana excluye esa semana del alumno', async () => {
      const a = await alumno({ fechaInicio: '2026-11-04' });
      for (const f of ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']) await turno(a.expediente.id, f);
      const r = await generar();
      expect(r.registro.metrica).toMatchObject({ numerador: 1, denominador: 1 });
      expect(r.registro.semanas.map((s) => s.semana)).toEqual(['2026-11-09']);
    });

    it('RN-15: el día se toma en hora de Monterrey, no en UTC', async () => {
      const a = await alumno();
      // 20:00 Monterrey on Mon..Thu is 02:00 UTC of the next day; Sunday 23:30 local belongs to the same week.
      for (const f of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) await turno(a.expediente.id, f, '20:00');
      const r = await generar();
      expect(r.registro.semanas[0]).toMatchObject({ semana: '2026-11-02', cumplen: 1 });
    });

    it('Piloto §12: cuenta turnos de cualquier estado como día registrado', async () => {
      const a = await alumno();
      await turno(a.expediente.id, '2026-11-02', '09:00', 'CERRADA');
      await turno(a.expediente.id, '2026-11-03', '09:00', 'INCOMPLETA');
      await turno(a.expediente.id, '2026-11-04', '09:00', 'CERRADA');
      await turno(a.expediente.id, '2026-11-05', '09:00', 'ABIERTA'); // an open shift must be the last one (no overlaps)
      const r = await generar();
      expect(r.registro.semanas[0]).toMatchObject({ semana: '2026-11-02', cumplen: 1, total: 1 });
    });

    it('Piloto §12: sin alumnos la métrica es "sin datos"', async () => {
      const r = await generar();
      expect(r.expedientes).toBe(0);
      expect(r.registro.metrica).toMatchObject({ denominador: 0, porcentaje: null, cumple: null });
      expect(formatearReporte(r)).toContain('sin datos');
    });
  });

  describe('métrica 2: semanas validadas dentro de 7 días', () => {
    it('Piloto §12: clasifica a tiempo, tardía, rechazada y pendiente (RN-18)', async () => {
      const a = await alumno();
      const enviadaEn = instanteLocal('2026-11-09', '10:00');
      await semanaEnviada(a.expediente.id, '2026-11-02', 'VALIDADA', enviadaEn, new Date(enviadaEn.getTime() + 7 * 24 * HORA));
      const b = await alumno();
      await semanaEnviada(b.expediente.id, '2026-11-02', 'VALIDADA', enviadaEn, new Date(enviadaEn.getTime() + 7 * 24 * HORA + 60_000));
      const c = await alumno();
      await semanaEnviada(c.expediente.id, '2026-11-02', 'RECHAZADA', enviadaEn);
      const d = await alumno();
      await semanaEnviada(d.expediente.id, '2026-11-02', 'ENVIADA', enviadaEn); // sent 11 days before "today": overdue
      const e = await alumno();
      await semanaEnviada(e.expediente.id, '2026-11-09', 'ENVIADA', instanteLocal('2026-11-15', '10:00')); // 5 days: not overdue

      const r = await generar();

      expect(r.validacion).toMatchObject({ enviadas: 5, aTiempo: 1, tarde: 1, rechazadas: 1, pendientes: 2, pendientesVencidas: 1 });
      expect(r.validacion.metrica).toMatchObject({ numerador: 1, denominador: 5, porcentaje: 20, cumple: false });
    });

    it('Piloto §12: solo cuentan las semanas enviadas dentro del rango y las no enviadas se ignoran', async () => {
      const a = await alumno();
      await semanaEnviada(a.expediente.id, '2026-10-26', 'VALIDADA', instanteLocal('2026-11-01', '23:59'), instanteLocal('2026-11-02', '10:00'));
      await semanaEnviada(a.expediente.id, '2026-11-02', 'VALIDADA', instanteLocal('2026-11-02', '00:00'), instanteLocal('2026-11-03', '10:00'));
      await semanaEnviada(a.expediente.id, '2026-11-09', 'VALIDADA', instanteLocal('2026-11-15', '23:59'), instanteLocal('2026-11-16', '10:00'));
      await semanaEnviada(a.expediente.id, '2026-11-16', 'VALIDADA', instanteLocal('2026-11-16', '00:00'), instanteLocal('2026-11-17', '10:00'));
      await prisma.semanaBitacora.create({ data: { expedienteId: a.expediente.id, semanaInicio: new Date('2026-11-23T00:00:00.000Z') } });

      const r = await generar();

      expect(r.validacion.enviadas).toBe(2);
    });

    it('Piloto §12: sin semanas enviadas es "sin datos"', async () => {
      await alumno();
      const r = await generar();
      expect(r.validacion.metrica).toMatchObject({ denominador: 0, porcentaje: null, cumple: null });
    });
  });

  describe('métrica 3: turnos incompletos', () => {
    it('RN-08: INCOMPLETA y ABIERTA de un día anterior son incompletos; ABIERTA de hoy se excluye', async () => {
      const a = await alumno();
      await turno(a.expediente.id, '2026-11-02');
      await turno(a.expediente.id, '2026-11-03');
      await turno(a.expediente.id, '2026-11-04');
      await turno(a.expediente.id, '2026-11-05', '09:00', 'INCOMPLETA');
      await turno(a.expediente.id, '2026-11-06', '09:00', 'ABIERTA');
      const b = await alumno();
      await turno(b.expediente.id, '2026-11-20', '08:00', 'ABIERTA');

      const r = await generar({ hasta: '2026-11-22' });

      expect(r.turnos).toMatchObject({ cerrados: 3, incompletos: 2, abiertosHoy: 1 });
      expect(r.turnos.metrica).toMatchObject({ numerador: 2, denominador: 5, porcentaje: 40, cumple: false });
    });

    it('RN-15: un turno abierto a las 23:59 de ayer (Monterrey) ya es incompleto', async () => {
      const a = await alumno();
      await turno(a.expediente.id, '2026-11-14', '23:59', 'ABIERTA');
      const r = await generar({}, instanteLocal('2026-11-15', '00:01'));
      expect(r.turnos).toMatchObject({ incompletos: 1, abiertosHoy: 0 });
    });

    it('Piloto §12: sin turnos decididos es "sin datos"', async () => {
      await alumno();
      const r = await generar();
      expect(r.turnos.metrica).toMatchObject({ denominador: 0, porcentaje: null, cumple: null });
    });
  });

  describe('turnos de libreta (RF-17a, RN-19)', () => {
    it('RN-19: un día con solo turnos de libreta no cuenta como día registrado', async () => {
      const a = await alumno();
      for (const f of ['2026-11-02', '2026-11-03', '2026-11-04']) await turno(a.expediente.id, f);
      await turno(a.expediente.id, '2026-11-05', '09:00', 'CERRADA', 'LIBRETA');
      await turno(a.expediente.id, '2026-11-06', '09:00', 'CERRADA', 'LIBRETA');
      // Same day as a QR shift: the day counts once, thanks to the QR shift.
      await turno(a.expediente.id, '2026-11-04', '15:00', 'CERRADA', 'LIBRETA');

      const r = await generar();

      expect(r.registro.semanas[0]).toMatchObject({ semana: '2026-11-02', cumplen: 0, total: 1 });
      expect(r.registro.semanas[0]!.bajo).toEqual([expect.objectContaining({ dias: 3 })]);
      expect(r.filas[0]).toMatchObject({ dias: 3, cumple: false, turnos: 3 });
    });

    it('RN-19: los turnos de libreta no cuentan en la métrica 3, ni cerrados ni incompletos', async () => {
      const a = await alumno();
      await turno(a.expediente.id, '2026-11-02');
      await turno(a.expediente.id, '2026-11-03', '09:00', 'INCOMPLETA');
      await turno(a.expediente.id, '2026-11-04', '09:00', 'CERRADA', 'LIBRETA');
      await turno(a.expediente.id, '2026-11-05', '09:00', 'INCOMPLETA', 'LIBRETA');

      const r = await generar();

      expect(r.turnos).toMatchObject({ cerrados: 1, incompletos: 1 });
      expect(r.filas[0]).toMatchObject({ turnos: 2, turnosIncompletos: 1 });
    });

    it('RN-19: las semanas de libreta siguen contando en la métrica 2', async () => {
      const a = await alumno();
      await turno(a.expediente.id, '2026-11-02', '09:00', 'CERRADA', 'LIBRETA');
      const enviadaEn = instanteLocal('2026-11-09', '10:00');
      const semana = await semanaEnviada(a.expediente.id, '2026-11-02', 'VALIDADA', enviadaEn, new Date(enviadaEn.getTime() + 2 * 24 * HORA));
      await prisma.semanaBitacora.update({ where: { id: semana.id }, data: { deLibreta: true } });

      const r = await generar();

      expect(r.validacion).toMatchObject({ enviadas: 1, aTiempo: 1 });
      expect(r.filas[0]).toMatchObject({ enviadas: 1, validadasATiempo: 1, dias: 0 });
    });

    it('RN-19: el reporte informa cuántos turnos de libreta se excluyeron', async () => {
      const a = await alumno();
      await turno(a.expediente.id, '2026-11-02');
      await turno(a.expediente.id, '2026-11-03', '09:00', 'CERRADA', 'LIBRETA');
      await turno(a.expediente.id, '2026-11-04', '09:00', 'CERRADA', 'LIBRETA');
      await turno(a.expediente.id, '2026-11-20', '09:00', 'CERRADA', 'LIBRETA'); // outside the range

      const r = await generar();

      expect(r.turnosLibretaExcluidos).toBe(2);
      expect(formatearReporte(r)).toContain('se excluyeron 2 turno(s) de las métricas 1 y 3');
    });
  });

  describe('población y filtros', () => {
    it('Piloto §12: incluye EN_PROCESO, SUSPENDIDO y FINALIZADO con inicio dentro o antes del rango', async () => {
      const enProceso = await alumno({ estado: 'EN_PROCESO' });
      const suspendido = await alumno({ estado: 'SUSPENDIDO' });
      const finalizado = await alumno({ estado: 'FINALIZADO', fechaTermino: '2026-11-10' });
      await alumno({ estado: 'PENDIENTE' });
      await alumno({ estado: 'CANCELADO' });
      await alumno({ estado: 'EN_PROCESO', fechaInicio: '2026-11-16' }); // starts after the range
      await alumno({ estado: 'EN_PROCESO', fechaInicio: null });
      await alumno({ estado: 'FINALIZADO', fechaInicio: '2026-09-01', fechaTermino: '2026-10-31' }); // ended before the range

      const r = await generar();

      expect(r.expedientes).toBe(3);
      expect(r.filas.map((f) => f.matricula).sort()).toEqual(
        [enProceso, suspendido, finalizado].map((x) => x.usuario.username!).sort().flatMap((m) => [m, m]),
      );
    });

    it('Piloto §12: filtra por carrera, semestre, grupo y tipo', async () => {
      const prog = await carrera('Programación');
      const cont = await carrera('Contabilidad');
      const objetivo = await alumno({ carreraId: prog.id, semestre: 5, grupo: 'A', tipo: 'PRACTICAS' });
      await alumno({ carreraId: cont.id, semestre: 5, grupo: 'A', tipo: 'PRACTICAS' });
      await alumno({ carreraId: prog.id, semestre: 3, grupo: 'A', tipo: 'PRACTICAS' });
      await alumno({ carreraId: prog.id, semestre: 5, grupo: 'B', tipo: 'PRACTICAS' });
      await alumno({ carreraId: prog.id, semestre: 5, grupo: 'A', tipo: 'SERVICIO_SOCIAL' });

      const r = await generar({ carrera: prog.nombre, semestre: 5, grupo: 'A', tipo: 'PRACTICAS' });
      expect(r.expedientes).toBe(1);
      const [fila] = r.filas;
      expect(fila!.matricula).toBe(objetivo.usuario.username);

      expect((await generar({ carrera: prog.nombre })).expedientes).toBe(4);
      expect((await generar({ semestre: 3 })).expedientes).toBe(1);
      expect((await generar({ grupo: 'B' })).expedientes).toBe(1);
      expect((await generar({ tipo: 'SERVICIO_SOCIAL' })).expedientes).toBe(1);
    });

    it('Piloto §12: la carrera se busca sin distinguir mayúsculas ni acentos', async () => {
      const prog = await carrera('Programación');
      await alumno({ carreraId: prog.id });
      const nombre = prog.nombre.toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      const r = await generar({ carrera: `  ${nombre}  ` });
      expect(r.expedientes).toBe(1);
    });

    it('Piloto §12: una carrera desconocida es un error de uso', async () => {
      await expect(generar({ carrera: 'Carrera que no existe' })).rejects.toBeInstanceOf(ErrorUsoMetricas);
      await expect(generar({ carrera: 'Carrera que no existe' })).rejects.toThrow(/carrera/i);
    });

    it('Piloto §12: no incluye alumnos de otro plantel', async () => {
      const otro = (await crearPlantel()).id;
      try {
        await alumno();
        await alumno({ plantel: otro });
        expect((await generar()).expedientes).toBe(1);
        expect((await generar({ plantel: otro })).expedientes).toBe(1);
      } finally {
        await borrarPlantel(otro);
      }
    });

    it('Piloto §12: con más de un plantel exige --plantel; con uno lo usa', async () => {
      await alumno();
      const sinPlantel = { ...RANGO };
      expect((await generarReportePiloto(sinPlantel, AHORA)).expedientes).toBe(1);

      const otro = (await crearPlantel()).id;
      try {
        await expect(generarReportePiloto(sinPlantel, AHORA)).rejects.toThrow(/--plantel/);
        await expect(generarReportePiloto({ ...sinPlantel, plantel: 'no-existe' }, AHORA)).rejects.toBeInstanceOf(ErrorUsoMetricas);
      } finally {
        await borrarPlantel(otro);
      }
    });
  });

  describe('CSV y salida', () => {
    it('Piloto §12: una fila por alumno-semana con días, semanas enviadas y turnos', async () => {
      const a = await alumno({ nombre: 'Ana' });
      for (const f of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) await turno(a.expediente.id, f);
      await turno(a.expediente.id, '2026-11-06', '09:00', 'INCOMPLETA');
      const enviadaEn = instanteLocal('2026-11-09', '10:00');
      await semanaEnviada(a.expediente.id, '2026-11-02', 'VALIDADA', enviadaEn, new Date(enviadaEn.getTime() + 2 * 24 * HORA));

      const r = await generar();

      expect(r.filas).toHaveLength(2);
      expect(r.filas[0]).toMatchObject({
        matricula: a.usuario.username,
        tipo: 'SERVICIO_SOCIAL',
        semana: '2026-11-02',
        dias: 5,
        cumple: true,
        enviadas: 1,
        validadasATiempo: 1,
        turnos: 5,
        turnosIncompletos: 1,
      });
      expect(r.filas[1]).toMatchObject({ semana: '2026-11-09', dias: 0, cumple: false, enviadas: 0, validadasATiempo: 0, turnos: 0 });
    });

    it('RNF-07: el CSV empieza con BOM UTF-8, conserva acentos y no incluye datos prohibidos', async () => {
      const a = await alumno({ nombre: 'José Ángel' });
      await turno(a.expediente.id, '2026-11-02');
      const r = await generar();
      const csv = formatearCsv(r.filas);

      expect(csv.startsWith('﻿')).toBe(true);
      expect(csv).toContain('José Ángel');
      expect(csv).toContain(a.usuario.username!);
      expect(csv.split('\r\n')[0]).toBe('﻿Alumno,Matrícula,Tipo,Semana,Días registrados,Cumple 4 días,Semanas enviadas,Validadas a tiempo,Turnos,Turnos incompletos');
      expect(csv.toLowerCase()).not.toContain('curp');
    });

    it('Piloto §12: el CSV escapa comas y comillas y neutraliza fórmulas', () => {
      const csv = formatearCsv([
        { alumno: '=HYPERLINK("x"), Pérez', matricula: '1', tipo: 'PRACTICAS', semana: '2026-11-02', dias: 4, cumple: true, enviadas: 0, validadasATiempo: 0, turnos: 4, turnosIncompletos: 0 },
      ]);
      expect(csv).toContain(`"'=HYPERLINK(""x""), Pérez"`);
    });

    it('Piloto §12: el reporte imprime valor, meta, CUMPLE / NO CUMPLE y la nota de métricas manuales', async () => {
      const a = await alumno();
      for (const f of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) await turno(a.expediente.id, f);
      const texto = formatearReporte(await generar());
      expect(texto).toMatch(/CUMPLE/);
      expect(texto).toMatch(/NO CUMPLE|sin datos/);
      expect(texto).toContain('80 %');
      expect(texto).toContain('70 %');
      expect(texto).toContain('10 %');
      expect(texto).toMatch(/2 %/);
      expect(texto).toMatch(/4\.5/);
      expect(texto).toMatch(/manual/i);
    });
  });

  describe('solo lectura', () => {
    it('Piloto §12: generar el reporte no escribe nada en la base', async () => {
      const a = await alumno();
      await turno(a.expediente.id, '2026-11-02');
      await turno(a.expediente.id, '2026-11-03', '09:00', 'ABIERTA');
      await semanaEnviada(a.expediente.id, '2026-11-02', 'ENVIADA', instanteLocal('2026-11-09', '10:00'));
      const contar = async () => [
        await prisma.asistencia.count(),
        await prisma.semanaBitacora.count(),
        await prisma.expediente.count(),
        await prisma.auditLog.count(),
        await prisma.enlaceValidacion.count(),
        await prisma.asistencia.count({ where: { estado: 'ABIERTA' } }),
      ];
      const antes = await contar();

      await generar();

      expect(await contar()).toEqual(antes);
    });
  });
});
