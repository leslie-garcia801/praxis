// Date and time formatting. Always America/Monterrey (RN-15), never the device time zone.
// The frontend only formats what the API returns; it never computes hours.

const TIME_ZONE = 'America/Monterrey';
const LOCALE = 'es-MX';

const horaFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const fechaOptions = { weekday: 'long', day: 'numeric', month: 'long' } as const;
const fechaMonterrey = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, ...fechaOptions });
// A calendar date has no time zone: format it at UTC noon in UTC so it can never shift a day.
const fechaCalendario = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', ...fechaOptions });

const diaMonterreyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

// "10:11" for an ISO instant.
export function formatHora(iso: string): string {
  return horaFormat.format(new Date(iso)).replace(/^24:/, '00:');
}

// "lunes 16 de noviembre" for a calendar date ('YYYY-MM-DD') or an ISO instant.
export function formatFecha(fecha: string): string {
  const texto = CALENDAR_DATE.test(fecha)
    ? fechaCalendario.format(new Date(`${fecha}T12:00:00Z`))
    : fechaMonterrey.format(new Date(fecha));
  return texto.replace(',', '');
}

// "12 h 30 min", or "480 h" when there are no leftover minutes.
export function formatHoras(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

// True when the instant falls on today's calendar day in Monterrey.
export function esHoy(iso: string, ahora: Date = new Date()): boolean {
  return diaMonterrey(iso) === hoyMonterrey(ahora);
}

// 'YYYY-MM-DD' of an ISO instant on the Monterrey calendar.
export function diaMonterrey(iso: string): string {
  return diaMonterreyFormat.format(new Date(iso));
}

// Today's calendar date ('YYYY-MM-DD') in Monterrey.
export function hoyMonterrey(ahora: Date = new Date()): string {
  return diaMonterreyFormat.format(ahora);
}

const partesMonterrey = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Milliseconds the Monterrey wall clock is ahead of UTC at `instante` (negative: UTC-6).
function desfaseMonterrey(instante: number): number {
  const p = Object.fromEntries(partesMonterrey.formatToParts(new Date(instante)).map((x) => [x.type, x.value]));
  const pared = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return pared - Math.floor(instante / 60_000) * 60_000;
}

// ISO instant of a Monterrey calendar date ('YYYY-MM-DD') and time ('HH:MM'), for times typed in forms (RN-15).
export function instanteMonterrey(fecha: string, hora: string): string {
  const pared = Date.parse(`${fecha}T${hora}:00Z`);
  const aprox = pared - desfaseMonterrey(pared);
  return new Date(pared - desfaseMonterrey(aprox)).toISOString();
}

// Moves a calendar date by n days. Works at UTC noon so the day never shifts.
export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Monday ('YYYY-MM-DD') of the week of a calendar date; weeks run Monday to Sunday (RF-19).
export function lunesDeSemana(fecha: string): string {
  const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return sumarDias(fecha, -((diaSemana + 6) % 7));
}

const diaCortoFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', weekday: 'long', day: 'numeric' });
const diaMesFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', day: 'numeric', month: 'long' });
const diaMesAnioFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function enCalendario(fecha: string): Date {
  return new Date(`${fecha}T12:00:00Z`);
}

// "lunes 9" for a calendar date.
export function formatDiaCorto(fecha: string): string {
  return diaCortoFormat.format(enCalendario(fecha)).replace(',', '');
}

// "9 al 15 de noviembre"; "26 de octubre al 1 de noviembre" across months; with years across years.
export function formatRangoSemana(inicio: string, fin: string): string {
  const a = enCalendario(inicio);
  const b = enCalendario(fin);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return `${diaMesAnioFormat.format(a)} al ${diaMesAnioFormat.format(b)}`;
  }
  if (a.getUTCMonth() !== b.getUTCMonth()) {
    return `${diaMesFormat.format(a)} al ${diaMesFormat.format(b)}`;
  }
  return `${a.getUTCDate()} al ${diaMesFormat.format(b)}`;
}
