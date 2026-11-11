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

const diaMonterrey = new Intl.DateTimeFormat('en-CA', {
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
  return diaMonterrey.format(new Date(iso)) === diaMonterrey.format(ahora);
}
