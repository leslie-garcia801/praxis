import { lunesDeSemana, sumarDias } from '@/lib/tiempo';
import type { TurnoLibretaValues } from './schemas';

// Preview only (RF-17a): sums the typed durations per day and per week. The daily cap (RN-04) and the
// credited minutes are applied by the server; the screen says so.

export type DiaPrevia = { fecha: string; minutos: number };
export type SemanaPrevia = { inicio: string; fin: string; dias: DiaPrevia[]; minutos: number };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h! * 60 + m!;
}

export function agruparPorSemana(turnos: TurnoLibretaValues[]): SemanaPrevia[] {
  const semanas = new Map<string, Map<string, number>>();
  for (const t of turnos) {
    if (!FECHA.test(t.fecha) || !HORA.test(t.entrada) || !HORA.test(t.salida)) continue;
    const minutos = aMinutos(t.salida) - aMinutos(t.entrada);
    if (minutos <= 0) continue;
    const lunes = lunesDeSemana(t.fecha);
    const dias = semanas.get(lunes) ?? new Map<string, number>();
    dias.set(t.fecha, (dias.get(t.fecha) ?? 0) + minutos);
    semanas.set(lunes, dias);
  }
  return [...semanas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([inicio, dias]) => {
      const lista = [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, minutos]) => ({ fecha, minutos }));
      return { inicio, fin: sumarDias(inicio, 6), dias: lista, minutos: lista.reduce((acc, d) => acc + d.minutos, 0) };
    });
}
