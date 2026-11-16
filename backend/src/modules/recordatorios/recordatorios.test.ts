import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearAsistencia,
  crearExpediente,
  crearPlantel,
  crearSemana,
} from '../../../test/factories.js';
import type { EstadoExpediente, EstadoValidacion } from '../../generated/prisma/enums.js';
import { prisma } from '../../lib/prisma.js';
import { limpiarNotificaciones, notificacionesEnviadas } from '../../lib/push.js';
import { instanteLocal } from '../../lib/tiempo.js';
import { ejecutarRecordatorioBitacora, ejecutarRecordatorioSalida } from './recordatorios.service.js';

const HOY = '2026-11-11'; // Wednesday
const MIN = 60_000;
const TEXTO_VALIDO = 'Atendí a los usuarios del módulo, capturé datos y apoyé en el archivo.';

describe('recordatorios push (RF-28, RF-18, RN-08, RN-15, RN-17)', () => {
  let plantelId: string;
  let contador = 0;

  beforeEach(async () => {
    limpiarNotificaciones();
    plantelId = (await crearPlantel()).id;
  });

  afterEach(async () => {
    vi.useRealTimers();
    await prisma.suscripcionPush.deleteMany({ where: { usuario: { plantelId } } });
    await borrarPlantel(plantelId);
  });

  // A student with a push subscription and a case file.
  async function alumno({ estado = 'EN_PROCESO' as EstadoExpediente } = {}) {
    contador++;
    const usuario = await crearAlumnoPrecargado({ plantelId, matricula: `2531907399${String(contador).padStart(4, '0')}` });
    await prisma.suscripcionPush.create({
      data: { usuarioId: usuario.id, endpoint: `https://push.example.invalid/${usuario.id}`, p256dh: 'p', auth: 'a' },
    });
    const expediente = await crearExpediente({ alumnoId: usuario.alumno!.id, estado });
    return { usuario, expediente };
  }

  describe('recordatorio-salida', () => {
    const entrada = instanteLocal(HOY, '08:00');
    const en = (minutosDespues: number) => new Date(entrada.getTime() + minutosDespues * MIN);

    it('RF-28: recuerda una vez un turno abierto desde hace 6 h y marca la fila', async () => {
      const { usuario, expediente } = await alumno();
      const turno = await crearAsistencia({ expedienteId: expediente.id, entrada });

      const resumen = await ejecutarRecordatorioSalida({ ahora: en(360) });

      expect(resumen.recordados).toBe(1);
      expect(resumen.enviadas).toBe(1);
      expect(notificacionesEnviadas()).toHaveLength(1);
      expect(notificacionesEnviadas()[0]).toMatchObject({
        usuarioId: usuario.id,
        titulo: '¿Olvidaste registrar tu salida?',
        url: '/alumno/registrar',
      });
      const fila = await prisma.asistencia.findUniqueOrThrow({ where: { id: turno.id } });
      expect(fila.recordatorioEnviadoEn).toEqual(en(360));
    });

    it('RF-28: no recuerda un turno abierto hace 5 h 59 min', async () => {
      const { expediente } = await alumno();
      const turno = await crearAsistencia({ expedienteId: expediente.id, entrada });

      const resumen = await ejecutarRecordatorioSalida({ ahora: en(359) });

      expect(resumen.recordados).toBe(0);
      expect(notificacionesEnviadas()).toEqual([]);
      expect((await prisma.asistencia.findUniqueOrThrow({ where: { id: turno.id } })).recordatorioEnviadoEn).toBeNull();
    });

    it('RF-28: no recuerda turnos cerrados ni INCOMPLETA', async () => {
      const { expediente } = await alumno();
      await crearAsistencia({ expedienteId: expediente.id, entrada, minutos: 400 });
      await crearAsistencia({ expedienteId: expediente.id, entrada: instanteLocal('2026-11-10', '08:00'), minutos: 100, estado: 'INCOMPLETA', minutosAcreditables: 0 });

      const resumen = await ejecutarRecordatorioSalida({ ahora: en(600) });

      expect(resumen.recordados).toBe(0);
      expect(notificacionesEnviadas()).toEqual([]);
    });

    it('RF-28: no recuerda si el expediente no está EN_PROCESO', async () => {
      for (const estado of ['PENDIENTE', 'SUSPENDIDO', 'FINALIZADO', 'CANCELADO'] as const) {
        const { expediente } = await alumno({ estado });
        await crearAsistencia({ expedienteId: expediente.id, entrada });
      }

      const resumen = await ejecutarRecordatorioSalida({ ahora: en(600) });

      expect(resumen.recordados).toBe(0);
      expect(notificacionesEnviadas()).toEqual([]);
    });

    it('RF-28: no recuerda dos veces el mismo turno en dos ejecuciones', async () => {
      const { expediente } = await alumno();
      await crearAsistencia({ expedienteId: expediente.id, entrada });

      await ejecutarRecordatorioSalida({ ahora: en(370) });
      const segunda = await ejecutarRecordatorioSalida({ ahora: en(385) });

      expect(segunda.recordados).toBe(0);
      expect(notificacionesEnviadas()).toHaveLength(1);
    });

    it('RF-28: dos ejecuciones simultáneas envían una sola vez', async () => {
      const { expediente } = await alumno();
      await crearAsistencia({ expedienteId: expediente.id, entrada });

      const [a, b] = await Promise.all([ejecutarRecordatorioSalida({ ahora: en(370) }), ejecutarRecordatorioSalida({ ahora: en(370) })]);

      expect(a.recordados + b.recordados).toBe(1);
      expect(notificacionesEnviadas()).toHaveLength(1);
    });

    it('RN-15, RF-28: el cuerpo usa la hora de Monterrey', async () => {
      const { expediente } = await alumno();
      await crearAsistencia({ expedienteId: expediente.id, entrada: instanteLocal(HOY, '08:05') });

      await ejecutarRecordatorioSalida({ ahora: instanteLocal(HOY, '14:30') });

      expect(notificacionesEnviadas()[0]!.cuerpo).toBe('Tu turno sigue abierto desde las 08:05.');
    });

    it('RF-28: sin suscripciones marca la fila y no envía nada', async () => {
      const { usuario, expediente } = await alumno();
      await prisma.suscripcionPush.deleteMany({ where: { usuarioId: usuario.id } });
      const turno = await crearAsistencia({ expedienteId: expediente.id, entrada });

      const resumen = await ejecutarRecordatorioSalida({ ahora: en(400) });

      expect(resumen.recordados).toBe(1);
      expect(resumen.enviadas).toBe(0);
      expect((await prisma.asistencia.findUniqueOrThrow({ where: { id: turno.id } })).recordatorioEnviadoEn).not.toBeNull();
    });

    it('RF-28: con el push apagado no envía ni marca la fila, para recordar cuando haya claves', async () => {
      const { expediente } = await alumno();
      const turno = await crearAsistencia({ expedienteId: expediente.id, entrada });

      const resumen = await ejecutarRecordatorioSalida({ ahora: en(400), apagado: () => true });

      expect(resumen).toMatchObject({ pushApagado: true, recordados: 0, enviadas: 0 });
      expect(notificacionesEnviadas()).toEqual([]);
      expect((await prisma.asistencia.findUniqueOrThrow({ where: { id: turno.id } })).recordatorioEnviadoEn).toBeNull();
    });

    it('RN-08: no recuerda un turno de un día anterior (entrada 20:00, ahora 02:00 del día siguiente)', async () => {
      const { expediente } = await alumno();
      await crearAsistencia({ expedienteId: expediente.id, entrada: instanteLocal(HOY, '20:00') });

      const resumen = await ejecutarRecordatorioSalida({ ahora: instanteLocal('2026-11-12', '02:00') });

      expect(resumen.recordados).toBe(0);
      expect(notificacionesEnviadas()).toEqual([]);
    });

    it('RN-08: cerca de la medianoche de Monterrey recuerda a las 23:59 y no a las 00:00', async () => {
      const { expediente } = await alumno();
      await crearAsistencia({ expedienteId: expediente.id, entrada: instanteLocal(HOY, '10:00') });

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(instanteLocal('2026-11-12', '00:00'));
      const medianoche = await ejecutarRecordatorioSalida({ ahora: new Date() });
      vi.setSystemTime(instanteLocal(HOY, '23:59'));
      const antes = await ejecutarRecordatorioSalida({ ahora: new Date() });

      expect(medianoche.recordados).toBe(0);
      expect(antes.recordados).toBe(1);
    });

    it('RF-28: reporta los fallos del envío sin lanzar', async () => {
      const { expediente } = await alumno();
      await crearAsistencia({ expedienteId: expediente.id, entrada });

      const resumen = await ejecutarRecordatorioSalida({
        ahora: en(400),
        enviar: () => Promise.resolve({ enviadas: 0, eliminadas: 0, errores: [{ endpoint: 'https://x.invalid', mensaje: 'falló' }] }),
      });

      expect(resumen.errores).toEqual([{ endpoint: 'https://x.invalid', mensaje: 'falló' }]);
    });
  });

  describe('recordatorio-bitacora', () => {
    // Sunday 2026-11-15, 18:00 in Monterrey. Current week starts Monday 2026-11-09.
    const DOMINGO = instanteLocal('2026-11-15', '18:00');
    const SEMANA = '2026-11-09';

    async function conSemana({
      estado = 'BORRADOR' as EstadoValidacion,
      actividades = 'corto' as string | null,
      semanaInicio = SEMANA,
      expedienteEstado = 'EN_PROCESO' as EstadoExpediente,
      asistencia = true,
    } = {}) {
      const a = await alumno({ estado: expedienteEstado });
      const semana = await crearSemana({ expedienteId: a.expediente.id, semanaInicio, estado });
      await prisma.semanaBitacora.update({ where: { id: semana.id }, data: { actividades } });
      if (asistencia) await crearAsistencia({ expedienteId: a.expediente.id, entrada: instanteLocal(semanaInicio, '09:00'), minutos: 120, semanaId: semana.id });
      return { ...a, semana };
    }

    it('RF-28, RN-17: recuerda la semana actual con asistencia y bitácora corta, y la marca', async () => {
      const { usuario, semana } = await conSemana();

      const resumen = await ejecutarRecordatorioBitacora({ ahora: DOMINGO });

      expect(resumen.recordadas).toBe(1);
      expect(notificacionesEnviadas()).toHaveLength(1);
      expect(notificacionesEnviadas()[0]).toMatchObject({
        usuarioId: usuario.id,
        titulo: 'Escribe tu bitácora de la semana',
        cuerpo: 'Escribe lo que hiciste esta semana para enviarla a tu supervisor.',
        url: `/alumno/historial?semana=${SEMANA}`,
      });
      expect((await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: semana.id } })).recordatorioBitacoraEn).toEqual(DOMINGO);
    });

    it('RN-17: recuerda también con bitácora vacía', async () => {
      await conSemana({ actividades: null });
      expect((await ejecutarRecordatorioBitacora({ ahora: DOMINGO })).recordadas).toBe(1);
    });

    it('RN-17: no recuerda si la bitácora ya es válida', async () => {
      await conSemana({ actividades: TEXTO_VALIDO });
      const resumen = await ejecutarRecordatorioBitacora({ ahora: DOMINGO });
      expect(resumen.recordadas).toBe(0);
      expect(notificacionesEnviadas()).toEqual([]);
    });

    it('RF-28: no recuerda semanas ya enviadas ni validadas', async () => {
      await conSemana({ estado: 'ENVIADA' });
      await conSemana({ estado: 'VALIDADA' });
      expect((await ejecutarRecordatorioBitacora({ ahora: DOMINGO })).recordadas).toBe(0);
    });

    it('RF-28: no recuerda a un alumno sin asistencia esa semana', async () => {
      await conSemana({ asistencia: false });
      expect((await ejecutarRecordatorioBitacora({ ahora: DOMINGO })).recordadas).toBe(0);
    });

    it('RF-28: solo la semana actual: una semana anterior no se recuerda', async () => {
      await conSemana({ semanaInicio: '2026-11-02' });
      expect((await ejecutarRecordatorioBitacora({ ahora: DOMINGO })).recordadas).toBe(0);
    });

    it('RF-28: no recuerda si el expediente no está EN_PROCESO', async () => {
      await conSemana({ expedienteEstado: 'SUSPENDIDO' });
      await conSemana({ expedienteEstado: 'CANCELADO' });
      expect((await ejecutarRecordatorioBitacora({ ahora: DOMINGO })).recordadas).toBe(0);
    });

    it('RF-28: protege contra doble ejecución, también simultánea; --forzar la ignora', async () => {
      await conSemana();

      const [a, b] = await Promise.all([ejecutarRecordatorioBitacora({ ahora: DOMINGO }), ejecutarRecordatorioBitacora({ ahora: DOMINGO })]);
      expect(a.recordadas + b.recordadas).toBe(1);
      expect(notificacionesEnviadas()).toHaveLength(1);

      expect((await ejecutarRecordatorioBitacora({ ahora: DOMINGO })).recordadas).toBe(0);
      const forzada = await ejecutarRecordatorioBitacora({ ahora: DOMINGO, forzar: true });
      expect(forzada.recordadas).toBe(1);
      expect(notificacionesEnviadas()).toHaveLength(2);
    });

    it('RF-28: con el push apagado no envía ni marca la semana', async () => {
      const { semana } = await conSemana();
      const resumen = await ejecutarRecordatorioBitacora({ ahora: DOMINGO, apagado: () => true });
      expect(resumen).toMatchObject({ pushApagado: true, recordadas: 0 });
      expect((await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: semana.id } })).recordatorioBitacoraEn).toBeNull();
    });
  });
});
