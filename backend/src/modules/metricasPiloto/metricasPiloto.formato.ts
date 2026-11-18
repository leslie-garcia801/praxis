// Text and CSV output of the pilot metrics report. Pure: no database, no clock.
import type { Meta } from '../../domain/metricasPiloto.js';
import type { FilaCsv, ReportePiloto } from './metricasPiloto.service.js';

const entero = (n: number) => String(n);

function linea(etiqueta: string, m: Meta, sentido: '≥' | '≤', unidad: string): string {
  const valor = m.porcentaje === null ? 'sin datos' : `${m.porcentaje} % (${m.numerador} de ${m.denominador} ${unidad})`;
  const veredicto = m.cumple === null ? 'sin datos' : m.cumple ? 'CUMPLE' : 'NO CUMPLE';
  return `${etiqueta}: ${valor} | Meta ${sentido} ${m.meta} % | ${veredicto}`;
}

export function formatearReporte(r: ReportePiloto): string {
  const filtros = Object.entries(r.filtros)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  const l: string[] = [];
  l.push('Métricas del piloto (specs §12)');
  l.push(`  Rango: ${r.desde} a ${r.hasta} (días de Monterrey, inclusivo). Hoy: ${r.hoy}`);
  l.push(`  Plantel: ${r.plantel.nombre}`);
  l.push(`  Filtros: ${filtros || 'ninguno'}`);
  l.push(`  Población: ${r.expedientes} expediente(s) de ${r.alumnos} alumno(s)`);
  l.push('');
  l.push('1. Registro de al menos 4 días por semana');
  l.push(`  ${linea('Resultado', r.registro.metrica, '≥', 'semanas de alumno')}`);
  for (const s of r.registro.semanas) {
    l.push(`  Semana del ${s.semana}: ${s.cumplen} de ${s.total} cumplen`);
    for (const b of s.bajo) l.push(`    - ${b.alumno} (${b.matricula ?? 'sin matrícula'}, ${b.tipo}): ${b.dias} día(s)`);
  }
  l.push('');
  const v = r.validacion;
  l.push('2. Semanas validadas por el supervisor dentro de 7 días');
  l.push(`  ${linea('Resultado', v.metrica, '≥', 'semanas enviadas')}`);
  l.push(`  Validadas a tiempo: ${entero(v.aTiempo)}`);
  l.push(`  Validadas tarde: ${entero(v.tarde)}`);
  l.push(`  Rechazadas: ${entero(v.rechazadas)}`);
  l.push(`  Pendientes: ${entero(v.pendientes)} (con más de 7 días de espera, RN-18: ${entero(v.pendientesVencidas)})`);
  l.push('');
  const t = r.turnos;
  l.push('3. Turnos incompletos (sin salida)');
  l.push(`  ${linea('Resultado', t.metrica, '≤', 'turnos')}`);
  l.push(`  Cerrados: ${entero(t.cerrados)}`);
  l.push(`  Incompletos: ${entero(t.incompletos)}`);
  l.push(`  Abiertos hoy (no se cuentan todavía): ${entero(t.abiertosHoy)}`);
  l.push('');
  l.push(`Turnos de libreta (RN-19): se excluyeron ${entero(r.turnosLibretaExcluidos)} turno(s) de las métricas 1 y 3; las semanas de libreta sí cuentan en la métrica 2. En el CSV, Días registrados, Turnos y Turnos incompletos solo cuentan turnos de QR.`);
  l.push('');
  l.push('Las otras dos métricas de §12 se miden de forma manual: diferencia entre las horas de la app y de la hoja en papel (≤ 2 %) y utilidad percibida al final (≥ 4.5 en escala de 1 a 5).');
  return l.join('\n');
}

const ENCABEZADOS = [
  'Alumno',
  'Matrícula',
  'Tipo',
  'Semana',
  'Días registrados',
  'Cumple 4 días',
  'Semanas enviadas',
  'Validadas a tiempo',
  'Turnos',
  'Turnos incompletos',
];

function celda(valor: string | number): string {
  let texto = String(valor);
  // Neutralize spreadsheet formulas.
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/** UTF-8 CSV with BOM (so Excel reads the accents) and CRLF line endings. */
export function formatearCsv(filas: FilaCsv[]): string {
  const lineas = [ENCABEZADOS.join(',')];
  for (const f of filas) {
    lineas.push(
      [f.alumno, f.matricula ?? '', f.tipo, f.semana, f.dias, f.cumple ? 'Sí' : 'No', f.enviadas, f.validadasATiempo, f.turnos, f.turnosIncompletos]
        .map(celda)
        .join(','),
    );
  }
  return '﻿' + lineas.join('\r\n') + '\r\n';
}
