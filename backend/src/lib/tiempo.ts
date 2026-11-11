// Time zone utilities. Instants are stored in UTC; calendar days and wall-clock
// times are always interpreted in the app time zone (RN-15), never the server's.
// Pure functions based on Intl, no external dependencies.

export const ZONA_APP = 'America/Monterrey';

/** Calendar date as "YYYY-MM-DD". */
export type FechaISO = string;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zona: string): Intl.DateTimeFormat {
  let f = formatters.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zona,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(zona, f);
  }
  return f;
}

type PartesLocales = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partesLocales(instante: Date, zona: string): PartesLocales {
  const partes: Record<string, number> = {};
  for (const { type, value } of formatter(zona).formatToParts(instante)) {
    if (type !== 'literal') partes[type] = Number(value);
  }
  return partes as PartesLocales;
}

/** Offset of the zone at a given instant, in milliseconds (local − UTC). */
function offsetMs(instante: Date, zona: string): number {
  const p = partesLocales(instante, zona);
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const sinMs = instante.getTime() - instante.getUTCMilliseconds();
  return comoUtc - sinMs;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of an instant. */
export function fechaLocal(instante: Date, zona: string = ZONA_APP): FechaISO {
  const p = partesLocales(instante, zona);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** UTC instant for a local wall-clock time ("HH:mm") on a local date. */
export function instanteLocal(fecha: FechaISO, hora: string, zona: string = ZONA_APP): Date {
  const [y, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const [h, min] = hora.split(':').map(Number) as [number, number];
  const comoUtc = Date.UTC(y, m - 1, d, h, min);
  // First guess with the offset at that moment, then correct once in case it lands across a DST change.
  const primero = comoUtc - offsetMs(new Date(comoUtc), zona);
  return new Date(comoUtc - offsetMs(new Date(primero), zona));
}

/** Adds (or subtracts) calendar days to a date. */
export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  const [y, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Calendar days from `desde` to `hasta` (negative when `hasta` is earlier). */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  const aUtc = (f: FechaISO) => {
    const [y, m, d] = f.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((aUtc(hasta) - aUtc(desde)) / 86_400_000);
}

/** Instant of the next local midnight after the given instant. */
export function inicioDelDiaSiguiente(instante: Date, zona: string = ZONA_APP): Date {
  return instanteLocal(sumarDias(fechaLocal(instante, zona), 1), '00:00', zona);
}

/** Monday of the week (Monday to Sunday) that contains the given date. */
export function inicioSemana(fecha: FechaISO): FechaISO {
  const [y, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const diaSemana = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return sumarDias(fecha, -((diaSemana + 6) % 7));
}
