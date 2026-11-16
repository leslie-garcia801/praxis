import { describe, expect, it } from 'vitest';
import {
  clasificarTurno,
  clasificarValidacion,
  diasRegistradosEnSemana,
  evaluarMeta,
  resumirRegistro,
  resumirTurnos,
  resumirValidacion,
  semanasCompletas,
} from './metricasPiloto.js';
import { instanteLocal } from '../lib/tiempo.js';

const HORA = 3_600_000;
const MIN = 60_000;

describe('Piloto §12: evaluarMeta', () => {
  it('Piloto §12: sin denominador devuelve porcentaje y cumple nulos ("sin datos")', () => {
    expect(evaluarMeta(0, 0, 80, 'MINIMO')).toEqual({ numerador: 0, denominador: 0, porcentaje: null, meta: 80, cumple: null });
    expect(evaluarMeta(0, 0, 10, 'MAXIMO').cumple).toBeNull();
  });

  it('Piloto §12: la meta mínima se cumple justo en el límite (4 de 5 = 80 %)', () => {
    const m = evaluarMeta(4, 5, 80, 'MINIMO');
    expect(m.porcentaje).toBe(80);
    expect(m.cumple).toBe(true);
    expect(evaluarMeta(79, 100, 80, 'MINIMO').cumple).toBe(false);
  });

  it('Piloto §12: la meta máxima se cumple justo en el límite (1 de 10 = 10 %)', () => {
    expect(evaluarMeta(1, 10, 10, 'MAXIMO').cumple).toBe(true);
    expect(evaluarMeta(2, 11, 10, 'MAXIMO').cumple).toBe(false);
  });

  it('Piloto §12: redondea el porcentaje a un decimal sin afectar la comparación con la meta', () => {
    const m = evaluarMeta(2, 3, 70, 'MINIMO');
    expect(m.porcentaje).toBe(66.7);
    expect(m.cumple).toBe(false);
  });
});

describe('Piloto §12 métrica 1: semanasCompletas', () => {
  // 2026-11-16 is a Monday.
  it('Piloto §12: devuelve los lunes de las semanas completas dentro del rango', () => {
    expect(semanasCompletas('2026-11-16', '2026-12-06', '2026-11-01')).toEqual(['2026-11-16', '2026-11-23', '2026-11-30']);
  });

  it('Piloto §12: una semana parcialmente fuera del rango (al final) no cuenta', () => {
    expect(semanasCompletas('2026-11-16', '2026-12-05', '2026-11-01')).toEqual(['2026-11-16', '2026-11-23']);
  });

  it('Piloto §12: una semana parcialmente fuera del rango (al inicio) no cuenta', () => {
    expect(semanasCompletas('2026-11-18', '2026-12-06', null)).toEqual(['2026-11-23', '2026-11-30']);
  });

  it('Piloto §12: el rango que empieza en lunes y termina en domingo incluye esa semana', () => {
    expect(semanasCompletas('2026-11-16', '2026-11-22', null)).toEqual(['2026-11-16']);
  });

  it('Piloto §12: fechaInicio a mitad de semana excluye esa semana', () => {
    expect(semanasCompletas('2026-11-16', '2026-12-06', '2026-11-18')).toEqual(['2026-11-23', '2026-11-30']);
  });

  it('Piloto §12: fechaInicio en lunes incluye esa semana', () => {
    expect(semanasCompletas('2026-11-16', '2026-11-29', '2026-11-23')).toEqual(['2026-11-23']);
  });

  it('Piloto §12: fechaInicio posterior al rango no deja semanas', () => {
    expect(semanasCompletas('2026-11-16', '2026-11-29', '2026-12-01')).toEqual([]);
  });

  it('Piloto §12: un rango menor a una semana no deja semanas', () => {
    expect(semanasCompletas('2026-11-16', '2026-11-20', null)).toEqual([]);
  });
});

describe('Piloto §12 métrica 1: diasRegistradosEnSemana', () => {
  const lunes = '2026-11-16';
  const entrada = (fecha: string, hora = '09:00') => instanteLocal(fecha, hora);

  it('Piloto §12: cuenta días distintos aunque haya varios turnos el mismo día', () => {
    const entradas = [entrada('2026-11-16', '08:00'), entrada('2026-11-16', '15:00'), entrada('2026-11-17')];
    expect(diasRegistradosEnSemana(entradas, lunes)).toBe(2);
  });

  it('Piloto §12: exactamente 4 días son 4 y 3 días son 3', () => {
    const cuatro = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'].map((f) => entrada(f));
    expect(diasRegistradosEnSemana(cuatro, lunes)).toBe(4);
    expect(diasRegistradosEnSemana(cuatro.slice(0, 3), lunes)).toBe(3);
  });

  it('Piloto §12: 23:59 de Monterrey cuenta en su día y 00:00 en el siguiente (RN-15)', () => {
    // Sunday 23:59 belongs to this week; Monday 00:00 of the next week does not.
    expect(diasRegistradosEnSemana([entrada('2026-11-22', '23:59')], lunes)).toBe(1);
    expect(diasRegistradosEnSemana([entrada('2026-11-23', '00:00')], lunes)).toBe(0);
    // 2026-11-16 00:00 Monterrey is 06:00 UTC; one minute earlier is still the previous Sunday.
    expect(diasRegistradosEnSemana([new Date(entrada('2026-11-16', '00:00').getTime() - MIN)], lunes)).toBe(0);
    expect(diasRegistradosEnSemana([entrada('2026-11-16', '00:00')], lunes)).toBe(1);
  });

  it('Piloto §12: una entrada de 20:00 en Monterrey (02:00 UTC del día siguiente) cuenta en el día local', () => {
    const tarde = new Date('2026-11-17T02:00:00.000Z'); // Monday 20:00 in Monterrey
    expect(diasRegistradosEnSemana([tarde, entrada('2026-11-17')], lunes)).toBe(2);
  });

  it('Piloto §12: sin entradas son 0 días', () => {
    expect(diasRegistradosEnSemana([], lunes)).toBe(0);
  });
});

describe('Piloto §12 métrica 1: resumirRegistro', () => {
  it('Piloto §12: semanas con 4 o más días cumplen; con 3 no', () => {
    const m = resumirRegistro([5, 4, 3, 0]);
    expect(m).toMatchObject({ numerador: 2, denominador: 4, porcentaje: 50, meta: 80, cumple: false });
  });

  it('Piloto §12: 4 de 5 semanas cumple la meta de 80 %', () => {
    expect(resumirRegistro([4, 4, 4, 4, 3]).cumple).toBe(true);
  });

  it('Piloto §12: sin semanas es "sin datos"', () => {
    expect(resumirRegistro([])).toMatchObject({ denominador: 0, porcentaje: null, cumple: null });
  });
});

describe('Piloto §12 métrica 2: clasificarValidacion', () => {
  const enviadaEn = new Date('2026-11-16T15:00:00.000Z');
  const ahora = new Date('2026-12-30T00:00:00.000Z');
  const validada = (ms: number) => ({ estado: 'VALIDADA' as const, enviadaEn, validadoEn: new Date(enviadaEn.getTime() + ms) });

  it('Piloto §12: validada a exactamente 7 días es a tiempo', () => {
    expect(clasificarValidacion(validada(7 * 24 * HORA), ahora)).toBe('VALIDADA_A_TIEMPO');
  });

  it('Piloto §12: validada a 7 días y 1 minuto es tardía', () => {
    expect(clasificarValidacion(validada(7 * 24 * HORA + MIN), ahora)).toBe('VALIDADA_TARDE');
  });

  it('Piloto §12: validada el mismo instante en que se envió es a tiempo', () => {
    expect(clasificarValidacion(validada(0), ahora)).toBe('VALIDADA_A_TIEMPO');
  });

  it('Piloto §12: validada sin fecha de validación no se puede probar a tiempo y cuenta como tardía', () => {
    expect(clasificarValidacion({ estado: 'VALIDADA', enviadaEn, validadoEn: null }, ahora)).toBe('VALIDADA_TARDE');
  });

  it('Piloto §12: rechazada se clasifica aparte', () => {
    expect(clasificarValidacion({ estado: 'RECHAZADA', enviadaEn, validadoEn: null }, ahora)).toBe('RECHAZADA');
  });

  it('RN-18: pendiente de más de 7 días está vencida; con exactamente 7 días todavía no', () => {
    const pendiente = { estado: 'ENVIADA' as const, enviadaEn, validadoEn: null };
    expect(clasificarValidacion(pendiente, new Date(enviadaEn.getTime() + 7 * 24 * HORA))).toBe('PENDIENTE');
    expect(clasificarValidacion(pendiente, new Date(enviadaEn.getTime() + 7 * 24 * HORA + MIN))).toBe('PENDIENTE_VENCIDA');
  });
});

describe('Piloto §12 métrica 2: resumirValidacion', () => {
  it('Piloto §12: separa a tiempo, tardías, rechazadas y pendientes (con las vencidas)', () => {
    const r = resumirValidacion([
      'VALIDADA_A_TIEMPO',
      'VALIDADA_A_TIEMPO',
      'VALIDADA_A_TIEMPO',
      'VALIDADA_TARDE',
      'RECHAZADA',
      'PENDIENTE',
      'PENDIENTE_VENCIDA',
    ]);
    expect(r).toMatchObject({ enviadas: 7, aTiempo: 3, tarde: 1, rechazadas: 1, pendientes: 2, pendientesVencidas: 1 });
    expect(r.metrica).toMatchObject({ numerador: 3, denominador: 7, meta: 70, cumple: false });
  });

  it('Piloto §12: 7 de 10 a tiempo cumple exactamente la meta de 70 %', () => {
    const clases = [...Array(7).fill('VALIDADA_A_TIEMPO'), ...Array(3).fill('VALIDADA_TARDE')];
    expect(resumirValidacion(clases).metrica.cumple).toBe(true);
  });

  it('Piloto §12: sin semanas enviadas es "sin datos"', () => {
    const r = resumirValidacion([]);
    expect(r.enviadas).toBe(0);
    expect(r.metrica).toMatchObject({ denominador: 0, porcentaje: null, cumple: null });
  });
});

describe('Piloto §12 métrica 3: clasificarTurno', () => {
  const hoy = '2026-11-16';

  it('RN-08: un turno INCOMPLETA es incompleto', () => {
    expect(clasificarTurno({ estado: 'INCOMPLETA', entrada: instanteLocal('2026-11-10', '09:00') }, hoy)).toBe('INCOMPLETO');
  });

  it('RN-08: un turno ABIERTA de ayer ya es incompleto (se cierra al siguiente escaneo)', () => {
    expect(clasificarTurno({ estado: 'ABIERTA', entrada: instanteLocal('2026-11-15', '23:59') }, hoy)).toBe('INCOMPLETO');
  });

  it('RN-08: un turno ABIERTA de hoy todavía no se decide', () => {
    expect(clasificarTurno({ estado: 'ABIERTA', entrada: instanteLocal('2026-11-16', '00:00') }, hoy)).toBe('ABIERTO_HOY');
  });

  it('RN-15: el límite del día es la medianoche de Monterrey, no la de UTC', () => {
    // 2026-11-15 23:59 Monterrey is 2026-11-16 05:59 UTC: still "yesterday" for a Monterrey today.
    const entrada = instanteLocal('2026-11-15', '23:59');
    expect(entrada.toISOString()).toBe('2026-11-16T05:59:00.000Z');
    expect(clasificarTurno({ estado: 'ABIERTA', entrada }, hoy)).toBe('INCOMPLETO');
  });

  it('Piloto §12: un turno CERRADA es cerrado', () => {
    expect(clasificarTurno({ estado: 'CERRADA', entrada: instanteLocal('2026-11-10', '09:00') }, hoy)).toBe('CERRADO');
  });
});

describe('Piloto §12 métrica 3: resumirTurnos', () => {
  it('Piloto §12: los turnos abiertos hoy se excluyen del denominador', () => {
    const r = resumirTurnos(['CERRADO', 'CERRADO', 'CERRADO', 'INCOMPLETO', 'ABIERTO_HOY', 'ABIERTO_HOY']);
    expect(r).toMatchObject({ cerrados: 3, incompletos: 1, abiertosHoy: 2 });
    expect(r.metrica).toMatchObject({ numerador: 1, denominador: 4, porcentaje: 25, meta: 10, cumple: false });
  });

  it('Piloto §12: 1 incompleto de 10 turnos decididos cumple exactamente la meta de 10 %', () => {
    const r = resumirTurnos([...Array(9).fill('CERRADO'), 'INCOMPLETO']);
    expect(r.metrica.cumple).toBe(true);
  });

  it('Piloto §12: sin turnos decididos es "sin datos"', () => {
    expect(resumirTurnos([]).metrica).toMatchObject({ denominador: 0, porcentaje: null, cumple: null });
    expect(resumirTurnos(['ABIERTO_HOY']).metrica.cumple).toBeNull();
  });
});
