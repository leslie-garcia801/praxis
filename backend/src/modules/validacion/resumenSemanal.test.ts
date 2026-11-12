import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearExpediente,
  crearInstitucion,
  crearPlantel,
  crearSemana,
  crearSupervisor,
} from '../../../test/factories.js';
import type { EstadoExpediente, EstadoValidacion } from '../../generated/prisma/enums.js';
import { correosEnviados, limpiarCorreos } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import { instanteLocal } from '../../lib/tiempo.js';
import { ejecutarResumenSemanal } from './resumenSemanal.service.js';
import { enviarEnlaceValidacion } from './validacion.service.js';

// Monday 2026-11-16, 8:00 in Monterrey. Closed weeks: 2026-11-02 and 2026-11-09. In progress: 2026-11-16.
const LUNES = instanteLocal('2026-11-16', '08:00');
const ANTERIOR = '2026-11-09';
const ANTEPENULTIMA = '2026-11-02';
const EN_CURSO = '2026-11-16';
const TEXTO_VALIDO = 'Atendí a los usuarios del módulo, capturé datos y apoyé en el archivo.';
const HORA = 3_600_000;

describe('resumen semanal al supervisor (RF-20, RF-21, RF-21a, RF-22, RN-17, RF-29)', () => {
  let plantelId: string;
  let contador = 0;

  beforeEach(async () => {
    limpiarCorreos();
    plantelId = (await crearPlantel()).id;
  });

  afterEach(() => borrarPlantel(plantelId));

  async function supervisorNuevo() {
    const institucion = await crearInstitucion({ plantelId });
    return { institucion, supervisor: await crearSupervisor({ institucionId: institucion.id }) };
  }

  // One student with a case file and one week.
  async function alumnoConSemana(
    sup: Awaited<ReturnType<typeof supervisorNuevo>> | null,
    {
      semanaInicio = ANTERIOR,
      estado = 'BORRADOR',
      actividades = TEXTO_VALIDO,
      expedienteEstado = 'EN_PROCESO',
      datos = {},
    }: {
      semanaInicio?: string;
      estado?: EstadoValidacion;
      actividades?: string | null;
      expedienteEstado?: EstadoExpediente;
      datos?: Record<string, Date | null>;
    } = {},
  ) {
    contador++;
    const alumno = await crearAlumnoPrecargado({ plantelId, matricula: `2531906399${String(contador).padStart(4, '0')}` });
    const expediente = await crearExpediente({
      alumnoId: alumno.alumno!.id,
      tipo: 'PRACTICAS',
      estado: expedienteEstado,
      institucionId: sup?.institucion.id ?? null,
      datos: { supervisorId: sup?.supervisor.id ?? null },
    });
    const semana = await crearSemana({ expedienteId: expediente.id, semanaInicio, estado });
    await prisma.semanaBitacora.update({ where: { id: semana.id }, data: { actividades, ...datos } });
    return { expediente, semana };
  }

  const estadoDe = async (id: string) => (await prisma.semanaBitacora.findUniqueOrThrow({ where: { id } })).estado;

  it('RN-17: el resumen no envía una semana sin bitácora de 50 caracteres', async () => {
    const sup = await supervisorNuevo();
    const vacia = await alumnoConSemana(sup, { actividades: null });
    const corta = await alumnoConSemana(sup, { actividades: `  ${'a'.repeat(49)}  ` });

    const resumen = await ejecutarResumenSemanal({ ahora: LUNES });

    expect(resumen.enviadasAutomaticamente).toBe(0);
    expect(resumen.notificados).toEqual([]);
    expect(await estadoDe(vacia.semana.id)).toBe('BORRADOR');
    expect(await estadoDe(corta.semana.id)).toBe('BORRADOR');
    expect(correosEnviados()).toHaveLength(0);
  });

  it('RF-20: envía automáticamente la semana cerrada con bitácora y no toca la semana en curso', async () => {
    const sup = await supervisorNuevo();
    const cerrada = await alumnoConSemana(sup, { semanaInicio: ANTERIOR });
    const enCurso = await alumnoConSemana(sup, { semanaInicio: EN_CURSO });
    const suspendido = await alumnoConSemana(sup, { semanaInicio: ANTERIOR, expedienteEstado: 'SUSPENDIDO' });

    const resumen = await ejecutarResumenSemanal({ ahora: LUNES });

    expect(resumen.enviadasAutomaticamente).toBe(2);
    expect(await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: cerrada.semana.id } })).toMatchObject({ estado: 'ENVIADA', enviadaEn: LUNES });
    expect(await estadoDe(suspendido.semana.id)).toBe('ENVIADA');
    expect(await estadoDe(enCurso.semana.id)).toBe('BORRADOR');
  });

  it('RF-22: una semana rechazada solo se reenvía si el alumno corrigió la bitácora', async () => {
    const sup = await supervisorNuevo();
    const rechazo = new Date(LUNES.getTime() - 48 * HORA);
    const sinCorregir = await alumnoConSemana(sup, {
      estado: 'RECHAZADA',
      datos: { rechazadaEn: rechazo, bitacoraActualizadaEn: new Date(rechazo.getTime() - HORA) },
    });
    const corregida = await alumnoConSemana(sup, {
      estado: 'RECHAZADA',
      datos: { rechazadaEn: rechazo, bitacoraActualizadaEn: new Date(rechazo.getTime() + HORA) },
    });
    const corregidaCorta = await alumnoConSemana(sup, {
      estado: 'RECHAZADA',
      actividades: 'muy corta',
      datos: { rechazadaEn: rechazo, bitacoraActualizadaEn: new Date(rechazo.getTime() + HORA) },
    });

    const resumen = await ejecutarResumenSemanal({ ahora: LUNES });

    expect(resumen.enviadasAutomaticamente).toBe(1);
    expect(await estadoDe(sinCorregir.semana.id)).toBe('RECHAZADA');
    expect(await estadoDe(corregidaCorta.semana.id)).toBe('RECHAZADA');
    expect(await estadoDe(corregida.semana.id)).toBe('ENVIADA');
  });

  it('RF-21a: un solo correo por supervisor con las semanas de todos sus alumnos, incluidas las pendientes de un lunes anterior', async () => {
    const sup = await supervisorNuevo();
    const otro = await supervisorNuevo();
    const nueva = await alumnoConSemana(sup, { semanaInicio: ANTERIOR });
    const pendiente = await alumnoConSemana(sup, { semanaInicio: ANTEPENULTIMA, estado: 'ENVIADA' });
    const deOtro = await alumnoConSemana(otro, { semanaInicio: ANTERIOR });

    const resumen = await ejecutarResumenSemanal({ ahora: LUNES });

    expect(correosEnviados()).toHaveLength(2);
    expect(resumen.notificados).toHaveLength(2);
    expect(resumen.notificados.find((n) => n.supervisorId === sup.supervisor.id)?.semanas).toBe(2);
    const enlaces = await prisma.enlaceValidacion.findMany({ where: { supervisorId: sup.supervisor.id }, include: { semanas: true } });
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0]!.semanas.map((s) => s.semanaId).sort()).toEqual([nueva.semana.id, pendiente.semana.id].sort());
    expect(await prisma.enlaceValidacionSemana.count({ where: { semanaId: deOtro.semana.id } })).toBe(1);
  });

  it('RF-21: una semana ya VALIDADA no vuelve a aparecer', async () => {
    const sup = await supervisorNuevo();
    const validada = await alumnoConSemana(sup, { estado: 'VALIDADA' });

    const resumen = await ejecutarResumenSemanal({ ahora: LUNES });

    expect(resumen.notificados).toEqual([]);
    expect(correosEnviados()).toHaveLength(0);
    expect(await prisma.enlaceValidacionSemana.count({ where: { semanaId: validada.semana.id } })).toBe(0);
  });

  it('RF-21a: excluye el expediente cancelado y reporta el expediente sin supervisor', async () => {
    const sup = await supervisorNuevo();
    const cancelado = await alumnoConSemana(sup, { estado: 'ENVIADA', expedienteEstado: 'CANCELADO' });
    const huerfana = await alumnoConSemana(null, { estado: 'ENVIADA' });
    const normal = await alumnoConSemana(sup, { estado: 'ENVIADA' });

    const resumen = await ejecutarResumenSemanal({ ahora: LUNES });

    expect(resumen.sinSupervisor).toEqual([huerfana.semana.id]);
    expect(resumen.notificados).toEqual([{ supervisorId: sup.supervisor.id, semanas: 1 }]);
    expect(await prisma.enlaceValidacionSemana.count({ where: { semanaId: cancelado.semana.id } })).toBe(0);
    expect(await prisma.enlaceValidacionSemana.count({ where: { semanaId: normal.semana.id } })).toBe(1);
  });

  it('RF-21: si falla el envío a un supervisor, los demás reciben su correo y el resultado reporta el fallo', async () => {
    const malo = await supervisorNuevo();
    const bueno = await supervisorNuevo();
    await alumnoConSemana(malo, { estado: 'ENVIADA' });
    await alumnoConSemana(bueno, { estado: 'ENVIADA' });

    const resumen = await ejecutarResumenSemanal({
      ahora: LUNES,
      enviar: (supervisorId, semanaIds, reloj) => {
        if (supervisorId === malo.supervisor.id) return Promise.reject(new Error('Correo rebotado'));
        return enviarEnlaceValidacion(supervisorId, semanaIds, reloj);
      },
    });

    expect(resumen.fallidos).toEqual([{ supervisorId: malo.supervisor.id, error: 'Correo rebotado' }]);
    expect(resumen.notificados).toEqual([{ supervisorId: bueno.supervisor.id, semanas: 1 }]);
    expect(correosEnviados()).toHaveLength(1);
    expect(correosEnviados()[0]!.para).toBe(bueno.supervisor.correo);
  });

  it('RF-21a: una segunda ejecución inmediata no duplica correos; con forzar sí', async () => {
    const sup = await supervisorNuevo();
    await alumnoConSemana(sup, { estado: 'ENVIADA' });

    await ejecutarResumenSemanal({ ahora: LUNES });
    const segunda = await ejecutarResumenSemanal({ ahora: new Date(LUNES.getTime() + HORA) });

    expect(segunda.omitidos).toEqual([sup.supervisor.id]);
    expect(segunda.notificados).toEqual([]);
    expect(correosEnviados()).toHaveLength(1);

    const tercera = await ejecutarResumenSemanal({ ahora: new Date(LUNES.getTime() + HORA), forzar: true });
    expect(tercera.notificados).toHaveLength(1);
    expect(correosEnviados()).toHaveLength(2);

    // Past the protection window the next run sends again.
    const despues = await ejecutarResumenSemanal({ ahora: new Date(LUNES.getTime() + 13 * HORA) });
    expect(despues.notificados).toHaveLength(1);
  });

  it('RF-29: registra ENVIAR_SEMANA_AUTOMATICO sin usuario, con el estado anterior', async () => {
    const sup = await supervisorNuevo();
    const { semana } = await alumnoConSemana(sup);

    await ejecutarResumenSemanal({ ahora: LUNES });

    const auditoria = await prisma.auditLog.findMany({ where: { entidadId: semana.id, accion: 'ENVIAR_SEMANA_AUTOMATICO' } });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({
      usuarioId: null,
      entidad: 'SemanaBitacora',
      antes: { estado: 'BORRADOR' },
      despues: { estado: 'ENVIADA', enviadaEn: LUNES.toISOString() },
    });
  });
});
