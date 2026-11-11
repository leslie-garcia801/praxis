import { sumarDias } from '../../lib/tiempo.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const DIAS_VIGENCIA = 14;

export type SemanaDelCorreo = { alumno: string; semanaInicio: string };

// "semana del 9 al 15 de noviembre" / "semana del 30 de noviembre al 6 de diciembre". `semanaInicio` is a Monday.
export function etiquetaSemana(semanaInicio: string): string {
  const [, mesInicio, diaInicio] = semanaInicio.split('-').map(Number) as [number, number, number];
  const [, mesFin, diaFin] = sumarDias(semanaInicio, 6).split('-').map(Number) as [number, number, number];
  return mesInicio === mesFin
    ? `semana del ${diaInicio} al ${diaFin} de ${MESES[mesFin - 1]}`
    : `semana del ${diaInicio} de ${MESES[mesInicio - 1]} al ${diaFin} de ${MESES[mesFin - 1]}`;
}

const escapar = (texto: string) =>
  texto.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

// RF-21, RF-21a: the email that carries the validation link. Both versions have the same content.
export function correoDeValidacion({ supervisor, semanas, enlace }: { supervisor: string; semanas: SemanaDelCorreo[]; enlace: string }) {
  const lineas = semanas.map((s) => `${s.alumno} — ${etiquetaSemana(s.semanaInicio)}`);
  const aviso = `El enlace vence en ${DIAS_VIGENCIA} días. No necesitas crear una cuenta: solo abre el enlace, revisa las horas y la bitácora, y valida o rechaza cada semana.`;

  const texto = [
    `Hola, ${supervisor}:`,
    '',
    'Estos alumnos de CBTIS 258 registraron horas con tu institución y esperan tu validación:',
    '',
    ...lineas.map((l) => `- ${l}`),
    '',
    `Revisa y valida aquí: ${enlace}`,
    '',
    aviso,
  ].join('\n');

  const html = [
    `<p>Hola, ${escapar(supervisor)}:</p>`,
    '<p>Estos alumnos de CBTIS 258 registraron horas con tu institución y esperan tu validación:</p>',
    `<ul>${lineas.map((l) => `<li>${escapar(l)}</li>`).join('')}</ul>`,
    `<p><a href="${escapar(enlace)}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px">Revisar y validar</a></p>`,
    `<p>Si el botón no funciona, copia este enlace en tu navegador:<br>${escapar(enlace)}</p>`,
    `<p>${escapar(aviso)}</p>`,
  ].join('\n');

  return { asunto: 'Validación de horas de alumnos — CBTIS 258', html, texto };
}
