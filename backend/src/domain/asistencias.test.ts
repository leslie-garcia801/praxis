import { describe, expect, it } from 'vitest';
import { decidirAccion, motivoRechazoExpediente, resolverInstante } from './asistencias.js';

const ahora = new Date('2026-03-10T18:00:00.000Z');
const horas = (h: number) => h * 3_600_000;

describe('resolverInstante (RN-14)', () => {
  it('RN-14: con conexión usa la hora del servidor e ignora la del dispositivo', () => {
    const r = resolverInstante({ sinConexion: false, hora: new Date('2020-01-01T00:00:00.000Z'), ahora });
    expect(r).toEqual({ ok: true, instante: ahora });
  });

  it('RN-14: sin conexión usa la hora del dispositivo', () => {
    const hora = new Date(ahora.getTime() - horas(10));
    expect(resolverInstante({ sinConexion: true, hora, ahora })).toEqual({ ok: true, instante: hora });
  });

  it('RN-14: acepta exactamente 72 horas y rechaza más', () => {
    expect(resolverInstante({ sinConexion: true, hora: new Date(ahora.getTime() - horas(72)), ahora }).ok).toBe(true);
    expect(resolverInstante({ sinConexion: true, hora: new Date(ahora.getTime() - horas(72) - 1), ahora })).toEqual({
      ok: false,
      motivo: 'HORA_ANTIGUA',
    });
  });

  it('RN-14: tolera 5 minutos de reloj adelantado y rechaza más', () => {
    expect(resolverInstante({ sinConexion: true, hora: new Date(ahora.getTime() + 5 * 60_000), ahora }).ok).toBe(true);
    expect(resolverInstante({ sinConexion: true, hora: new Date(ahora.getTime() + 5 * 60_000 + 1), ahora })).toEqual({
      ok: false,
      motivo: 'HORA_FUTURA',
    });
  });

  it('RN-14: sin hora del dispositivo usa la del servidor', () => {
    expect(resolverInstante({ sinConexion: true, hora: undefined, ahora })).toEqual({ ok: true, instante: ahora });
  });
});

describe('decidirAccion (RN-07, RN-08)', () => {
  const entrada = new Date('2026-03-10T14:00:00.000Z'); // 08:00 Monterrey

  it('RN-07: sin turno abierto registra una entrada', () => {
    expect(decidirAccion(null, ahora)).toEqual({ tipo: 'ENTRADA', cerrarAnterior: false });
  });

  it('RN-07: con turno abierto del mismo día local registra la salida', () => {
    expect(decidirAccion({ entrada }, ahora)).toEqual({ tipo: 'SALIDA' });
  });

  it('RN-08: con turno abierto de un día local anterior lo cierra y registra una entrada nueva', () => {
    const manana = new Date('2026-03-11T15:00:00.000Z');
    expect(decidirAccion({ entrada }, manana)).toEqual({ tipo: 'ENTRADA', cerrarAnterior: true });
  });

  it('RN-15: el día se mide en hora de Monterrey, no en UTC', () => {
    // 23:30 local on the 10th is 05:30 UTC on the 11th: still the same local day.
    const tarde = new Date('2026-03-11T05:30:00.000Z');
    expect(decidirAccion({ entrada }, tarde)).toEqual({ tipo: 'SALIDA' });
  });

  it('rechaza un escaneo anterior a la entrada del turno abierto', () => {
    expect(decidirAccion({ entrada }, new Date(entrada.getTime() - 1000))).toEqual({
      tipo: 'RECHAZO',
      motivo: 'ESCANEO_ANTERIOR_AL_TURNO',
    });
  });
});

describe('motivoRechazoExpediente (RN-13)', () => {
  const base = { fechaInicio: '2026-03-10', fechaEscaneo: '2026-03-10' };

  it('RN-13: rechaza un expediente SUSPENDIDO', () => {
    expect(motivoRechazoExpediente({ ...base, estado: 'SUSPENDIDO' })).toBe('EXPEDIENTE_SUSPENDIDO');
  });

  it('rechaza expedientes que no están en proceso', () => {
    for (const estado of ['PENDIENTE', 'FINALIZADO', 'CANCELADO'] as const) {
      expect(motivoRechazoExpediente({ ...base, estado })).toBe('EXPEDIENTE_NO_ACTIVO');
    }
  });

  it('rechaza un escaneo anterior a la fecha de inicio', () => {
    expect(motivoRechazoExpediente({ estado: 'EN_PROCESO', fechaInicio: '2026-03-11', fechaEscaneo: '2026-03-10' })).toBe(
      'ANTES_DE_FECHA_INICIO',
    );
  });

  it('acepta el día de inicio, sin fecha de inicio y cualquier fecha posterior (sin tope de fechaTermino)', () => {
    expect(motivoRechazoExpediente({ ...base, estado: 'EN_PROCESO' })).toBeNull();
    expect(motivoRechazoExpediente({ estado: 'EN_PROCESO', fechaInicio: null, fechaEscaneo: '2026-03-10' })).toBeNull();
    expect(motivoRechazoExpediente({ estado: 'EN_PROCESO', fechaInicio: '2026-03-10', fechaEscaneo: '2027-01-01' })).toBeNull();
  });
});
