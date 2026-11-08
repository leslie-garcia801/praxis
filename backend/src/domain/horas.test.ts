import { describe, expect, it } from 'vitest';
import {
  calcularMinutosAcreditables,
  cerrarTurnoAbierto,
  estimarFechaTermino,
  minutosTurno,
  TOPE_MINUTOS_DIA,
  type TurnoParaCalculo,
} from './horas.js';

// All instants are written with the Monterrey offset (UTC-6) to keep tests readable.
const t = (local: string) => new Date(`${local}-06:00`);

function turno(id: string, entrada: string, salida: string): TurnoParaCalculo {
  return { id, entrada: t(entrada), salida: t(salida), estado: 'CERRADA' };
}

describe('minutosTurno', () => {
  it('RN-09: un turno de menos de 15 minutos acredita 0', () => {
    expect(minutosTurno(t('2026-11-09T08:00:00'), t('2026-11-09T08:14:59'))).toBe(0);
  });

  it('RN-09: un turno de exactamente 15 minutos sí cuenta', () => {
    expect(minutosTurno(t('2026-11-09T08:00:00'), t('2026-11-09T08:15:00'))).toBe(15);
  });

  it('trabaja con minutos enteros y descarta los segundos sobrantes', () => {
    expect(minutosTurno(t('2026-11-09T08:00:00'), t('2026-11-09T09:30:59'))).toBe(90);
  });
});

describe('calcularMinutosAcreditables', () => {
  it('acredita completo un turno dentro del tope', () => {
    const r = calcularMinutosAcreditables([turno('a', '2026-11-09T08:00:00', '2026-11-09T12:00:00')]);

    expect(r.porTurno).toEqual({ a: 240 });
    expect(r.porDia).toEqual({ '2026-11-09': { minutos: 240, acreditables: 240 } });
  });

  it('RN-04: acredita máximo 300 minutos por día', () => {
    const r = calcularMinutosAcreditables([turno('a', '2026-11-09T08:00:00', '2026-11-09T14:00:00')]);

    expect(TOPE_MINUTOS_DIA).toBe(300);
    expect(r.porTurno).toEqual({ a: 300 });
    // The excess is recorded but not credited
    expect(r.porDia['2026-11-09']).toEqual({ minutos: 360, acreditables: 300 });
  });

  it('RN-04: con varios turnos, el excedente se descuenta del último turno del día', () => {
    // Passed out of order on purpose: crediting must follow chronological order
    const r = calcularMinutosAcreditables([
      turno('tarde', '2026-11-09T12:00:00', '2026-11-09T15:00:00'),
      turno('manana', '2026-11-09T08:00:00', '2026-11-09T11:00:00'),
    ]);

    expect(r.porTurno).toEqual({ manana: 180, tarde: 120 });
    expect(r.porDia['2026-11-09']).toEqual({ minutos: 360, acreditables: 300 });
  });

  it('RN-04: un turno que llega cuando el día ya está lleno acredita 0', () => {
    const r = calcularMinutosAcreditables([
      turno('a', '2026-11-09T07:00:00', '2026-11-09T12:00:00'),
      turno('b', '2026-11-09T13:00:00', '2026-11-09T14:00:00'),
    ]);

    expect(r.porTurno).toEqual({ a: 300, b: 0 });
  });

  it('RN-04: el tope es independiente para cada día', () => {
    const r = calcularMinutosAcreditables([
      turno('lun', '2026-11-09T08:00:00', '2026-11-09T14:00:00'),
      turno('mar', '2026-11-10T08:00:00', '2026-11-10T14:00:00'),
    ]);

    expect(r.porTurno).toEqual({ lun: 300, mar: 300 });
  });

  it('RN-05: sábados y domingos cuentan igual que entre semana', () => {
    // 2026-11-07 is a Saturday and 2026-11-08 a Sunday
    const r = calcularMinutosAcreditables([
      turno('sab', '2026-11-07T09:00:00', '2026-11-07T13:00:00'),
      turno('dom', '2026-11-08T09:00:00', '2026-11-08T13:00:00'),
    ]);

    expect(r.porTurno).toEqual({ sab: 240, dom: 240 });
    expect(Object.keys(r.porDia)).toEqual(['2026-11-07', '2026-11-08']);
  });

  it('RN-15: agrupa los días en hora de Monterrey, no en UTC', () => {
    // 19:00–21:00 in Monterrey is already the next day in UTC
    const r = calcularMinutosAcreditables([turno('noche', '2026-11-09T19:00:00', '2026-11-09T21:00:00')]);

    expect(Object.keys(r.porDia)).toEqual(['2026-11-09']);
  });

  it('un turno que cruza la medianoche se parte entre los dos días', () => {
    const r = calcularMinutosAcreditables([turno('n', '2026-11-09T22:00:00', '2026-11-10T02:00:00')]);

    expect(r.porTurno).toEqual({ n: 240 });
    expect(r.porDia).toEqual({
      '2026-11-09': { minutos: 120, acreditables: 120 },
      '2026-11-10': { minutos: 120, acreditables: 120 },
    });
  });

  it('RN-04: un turno que cruza la medianoche respeta el tope de cada día', () => {
    const r = calcularMinutosAcreditables([
      turno('dia', '2026-11-09T08:00:00', '2026-11-09T12:00:00'), // 240 on day 1
      turno('noche', '2026-11-09T22:00:00', '2026-11-10T02:00:00'), // 120 day 1 + 120 day 2
    ]);

    // Day 1 only has 60 minutes left for the night shift; day 2 credits its full 120
    expect(r.porTurno).toEqual({ dia: 240, noche: 180 });
    expect(r.porDia['2026-11-09']).toEqual({ minutos: 360, acreditables: 300 });
    expect(r.porDia['2026-11-10']).toEqual({ minutos: 120, acreditables: 120 });
  });

  it('RN-09: el mínimo de 15 minutos se evalúa sobre el turno completo, antes de partirlo', () => {
    // 20 minutes in total: 10 before and 10 after midnight
    const r = calcularMinutosAcreditables([turno('n', '2026-11-09T23:50:00', '2026-11-10T00:10:00')]);

    expect(r.porTurno).toEqual({ n: 20 });
    expect(r.porDia['2026-11-09']).toEqual({ minutos: 10, acreditables: 10 });
    expect(r.porDia['2026-11-10']).toEqual({ minutos: 10, acreditables: 10 });
  });

  it('RN-09: un turno corto no ocupa espacio del tope diario', () => {
    const r = calcularMinutosAcreditables([
      turno('doble', '2026-11-09T07:00:00', '2026-11-09T07:05:00'),
      turno('a', '2026-11-09T08:00:00', '2026-11-09T13:00:00'),
    ]);

    expect(r.porTurno).toEqual({ doble: 0, a: 300 });
    expect(r.porDia['2026-11-09']).toEqual({ minutos: 300, acreditables: 300 });
  });

  it('RN-08: los turnos INCOMPLETA y ABIERTA acreditan 0', () => {
    const r = calcularMinutosAcreditables([
      { id: 'inc', entrada: t('2026-11-09T08:00:00'), salida: t('2026-11-09T23:59:00'), estado: 'INCOMPLETA' },
      { id: 'abierta', entrada: t('2026-11-10T08:00:00'), salida: null, estado: 'ABIERTA' },
    ]);

    expect(r.porTurno).toEqual({ inc: 0, abierta: 0 });
    expect(r.porDia).toEqual({});
  });

  it('sin turnos devuelve resultados vacíos', () => {
    expect(calcularMinutosAcreditables([])).toEqual({ porTurno: {}, porDia: {} });
  });
});

describe('cerrarTurnoAbierto', () => {
  it('RN-08: cierra a las 23:59 del día de entrada como INCOMPLETA con 0 minutos', () => {
    expect(cerrarTurnoAbierto(t('2026-11-09T15:00:00'))).toEqual({
      salida: t('2026-11-09T23:59:00'),
      estado: 'INCOMPLETA',
      minutosAcreditables: 0,
    });
  });

  it('RN-15: usa las 23:59 de Monterrey aunque en UTC ya sea otro día', () => {
    // 20:00 in Monterrey is 02:00 UTC of 2026-11-10
    expect(cerrarTurnoAbierto(t('2026-11-09T20:00:00')).salida).toEqual(t('2026-11-09T23:59:00'));
  });

  it('RN-08: si la entrada fue después de las 23:59, la salida queda justo después de la entrada', () => {
    const entrada = t('2026-11-09T23:59:30');
    const { salida } = cerrarTurnoAbierto(entrada);

    // Keeps the SQL constraint salida > entrada
    expect(salida.getTime()).toBeGreaterThan(entrada.getTime());
    expect(salida.getTime() - entrada.getTime()).toBe(1000);
  });
});

describe('estimarFechaTermino', () => {
  // Monday-to-Friday, 4 h a day, starting Wednesday 2026-11-11 (8 days with records up to Friday 2026-11-20)
  const lunesAViernes: Record<string, number> = {
    '2026-11-11': 240,
    '2026-11-12': 240,
    '2026-11-13': 240,
    '2026-11-16': 240,
    '2026-11-17': 240,
    '2026-11-18': 240,
    '2026-11-19': 240,
    '2026-11-20': 240,
  };

  it('RN-16: con menos de 5 días registrados devuelve "aún sin datos suficientes"', () => {
    const r = estimarFechaTermino({
      minutosFaltantes: 1000,
      minutosPorDia: { '2026-11-16': 240, '2026-11-17': 240, '2026-11-18': 240, '2026-11-19': 240 },
      hoy: t('2026-11-20T12:00:00'),
    });

    expect(r).toEqual({ tipo: 'SIN_DATOS' });
  });

  it('RN-16: con 5 días registrados ya estima', () => {
    const r = estimarFechaTermino({
      minutosFaltantes: 1000,
      minutosPorDia: {
        '2026-11-16': 240,
        '2026-11-17': 240,
        '2026-11-18': 240,
        '2026-11-19': 240,
        '2026-11-20': 240,
      },
      hoy: t('2026-11-20T12:00:00'),
    });

    expect(r.tipo).toBe('ESTIMADA');
  });

  it('RN-16: los días con 0 minutos acreditables no cuentan como registrados', () => {
    const r = estimarFechaTermino({
      minutosFaltantes: 1000,
      minutosPorDia: {
        '2026-11-16': 240,
        '2026-11-17': 240,
        '2026-11-18': 240,
        '2026-11-19': 240,
        '2026-11-20': 0,
      },
      hoy: t('2026-11-20T12:00:00'),
    });

    expect(r).toEqual({ tipo: 'SIN_DATOS' });
  });

  it('RN-16: si ya no faltan minutos devuelve COMPLETADO, aunque haya pocos datos', () => {
    expect(estimarFechaTermino({ minutosFaltantes: 0, minutosPorDia: {}, hoy: t('2026-11-20T12:00:00') })).toEqual({
      tipo: 'COMPLETADO',
    });
  });

  it('RN-16: promedia entre los días de calendario desde el primer registro', () => {
    // 8 days × 240 = 1920 minutes over 10 calendar days (Nov 11–20) → 192 min/day
    // 1000 missing ÷ 192 = 5.2 → 6 days → 2026-11-26
    const r = estimarFechaTermino({ minutosFaltantes: 1000, minutosPorDia: lunesAViernes, hoy: t('2026-11-20T12:00:00') });

    expect(r).toEqual({ tipo: 'ESTIMADA', fecha: '2026-11-26', promedioMinutosDia: 192 });
  });

  it('RN-16: con más de 28 días de historial usa solo los últimos 28 días', () => {
    // Heavy October outside the window; inside the window (Nov 3–30) only 5 × 120 = 600
    const minutosPorDia: Record<string, number> = {};
    for (let d = 1; d <= 20; d++) minutosPorDia[`2026-10-${String(d).padStart(2, '0')}`] = 300;
    for (const d of ['23', '24', '25', '26', '27']) minutosPorDia[`2026-11-${d}`] = 120;

    // 600 ÷ 28 = 21.43 min/day; 300 missing → exactly 14 days → 2026-12-14
    const r = estimarFechaTermino({ minutosFaltantes: 300, minutosPorDia, hoy: t('2026-11-30T12:00:00') });

    expect(r).toMatchObject({ tipo: 'ESTIMADA', fecha: '2026-12-14' });
  });

  it('RN-15: "hoy" es la fecha de Monterrey aunque en UTC ya sea el día siguiente', () => {
    // 21:00 in Monterrey on Nov 20 is already Nov 21 in UTC
    const r = estimarFechaTermino({ minutosFaltantes: 1000, minutosPorDia: lunesAViernes, hoy: t('2026-11-20T21:00:00') });

    expect(r).toMatchObject({ tipo: 'ESTIMADA', fecha: '2026-11-26' });
  });

  it('ignora registros con fecha posterior a hoy', () => {
    const r = estimarFechaTermino({
      minutosFaltantes: 1000,
      minutosPorDia: { ...lunesAViernes, '2026-11-25': 300 },
      hoy: t('2026-11-20T12:00:00'),
    });

    expect(r).toEqual({ tipo: 'ESTIMADA', fecha: '2026-11-26', promedioMinutosDia: 192 });
  });
});
