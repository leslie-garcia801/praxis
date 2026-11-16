import { describe, expect, it } from 'vitest';
import { instanteLocal } from '../lib/tiempo.js';
import { MINUTOS_RECORDAR_SALIDA, necesitaRecordatorioSalida } from './recordatorios.js';

const DIA = '2026-11-11';
const SIGUIENTE = '2026-11-12';
const entrada = instanteLocal(DIA, '08:00');
const despues = (minutos: number) => new Date(entrada.getTime() + minutos * 60_000);

describe('recordatorio de salida (RF-28, RN-08)', () => {
  it('RF-28: el umbral para recordar la salida es de 6 horas', () => {
    expect(MINUTOS_RECORDAR_SALIDA).toBe(360);
  });

  it('RF-28: un turno abierto hace 5 h 59 min todavía no necesita el recordatorio', () => {
    expect(necesitaRecordatorioSalida(entrada, despues(359))).toBe(false);
  });

  it('RF-28: entrada 08:00 necesita el recordatorio a las 14:00 del mismo día', () => {
    expect(necesitaRecordatorioSalida(entrada, instanteLocal(DIA, '14:00'))).toBe(true);
  });

  it('RF-28: un turno abierto hace más de 6 h el mismo día necesita el recordatorio', () => {
    expect(necesitaRecordatorioSalida(entrada, instanteLocal(DIA, '20:00'))).toBe(true);
  });

  it('RF-28: una entrada en el futuro no necesita el recordatorio', () => {
    expect(necesitaRecordatorioSalida(despues(10), entrada)).toBe(false);
  });

  it('RN-08: entrada 20:00 no se recuerda a las 02:00 del día siguiente (ya no se puede cerrar)', () => {
    expect(necesitaRecordatorioSalida(instanteLocal(DIA, '20:00'), instanteLocal(SIGUIENTE, '02:00'))).toBe(false);
  });

  it('RN-08: entrada 17:00 con 6 h cumplidas a las 23:00 se recuerda; a las 00:00 ya no', () => {
    const tarde = instanteLocal(DIA, '17:00');
    expect(necesitaRecordatorioSalida(tarde, instanteLocal(DIA, '23:00'))).toBe(true);
    expect(necesitaRecordatorioSalida(tarde, instanteLocal(SIGUIENTE, '00:00'))).toBe(false);
  });

  it('RN-08: 23:59 del mismo día sí, un minuto después no', () => {
    const e = instanteLocal(DIA, '00:30');
    const finDia = instanteLocal(DIA, '23:59');
    expect(necesitaRecordatorioSalida(e, finDia)).toBe(true);
    expect(necesitaRecordatorioSalida(e, new Date(finDia.getTime() + 60_000))).toBe(false);
  });
});
