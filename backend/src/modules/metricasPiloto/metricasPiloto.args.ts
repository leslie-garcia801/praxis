import { parseArgs } from 'node:util';
import { z } from 'zod';
import { sumarDias } from '../../lib/tiempo.js';

export const MENSAJE_USO = [
  'Uso: pnpm job:metricas-piloto -- --desde AAAA-MM-DD --hasta AAAA-MM-DD [opciones]',
  '     (producción: node dist/scripts/metricasPiloto.js --desde ... --hasta ...)',
  '  --desde AAAA-MM-DD   primer día del rango (hora de Monterrey, inclusivo)',
  '  --hasta AAAA-MM-DD   último día del rango (hora de Monterrey, inclusivo)',
  '  --carrera NOMBRE     solo alumnos de esa carrera (sin distinguir mayúsculas ni acentos)',
  '  --semestre N         solo alumnos de ese semestre',
  '  --grupo G            solo alumnos de ese grupo',
  '  --tipo TIPO          SERVICIO_SOCIAL o PRACTICAS (por defecto, ambos)',
  '  --plantel ID         obligatorio si hay más de un plantel',
  '  --csv RUTA           escribe un CSV con una fila por alumno y semana; "-" lo imprime por la salida estándar',
].join('\n');

export type ArgsMetricas = {
  desde: string;
  hasta: string;
  carrera?: string;
  semestre?: number;
  grupo?: string;
  tipo?: 'SERVICIO_SOCIAL' | 'PRACTICAS';
  plantel?: string;
  csv?: string;
};

const fechaReal = (campo: string) =>
  z
    .string({ error: `Falta ${campo}.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${campo} debe tener el formato AAAA-MM-DD.`)
    .refine((f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && sumarDias(f, 0) === f, `${campo} no es una fecha válida.`);

const noVacio = (campo: string) => z.string().trim().min(1, `${campo} no puede estar vacío.`);

const esquema = z
  .object({
    desde: fechaReal('--desde'),
    hasta: fechaReal('--hasta'),
    carrera: noVacio('--carrera').optional(),
    semestre: z
      .string()
      .regex(/^\d+$/, '--semestre debe ser un número entero.')
      .transform(Number)
      .refine((n) => n >= 1 && n <= 12, '--semestre debe estar entre 1 y 12.')
      .optional(),
    grupo: noVacio('--grupo').optional(),
    tipo: z.enum(['SERVICIO_SOCIAL', 'PRACTICAS'], { error: '--tipo debe ser SERVICIO_SOCIAL o PRACTICAS.' }).optional(),
    plantel: noVacio('--plantel').optional(),
    csv: noVacio('--csv').optional(),
  })
  .refine((a) => a.hasta >= a.desde, {
    message: '--hasta no puede ser anterior a --desde.',
    path: ['hasta'],
  });

export type ResultadoArgumentos = { ok: true; valor: ArgsMetricas } | { ok: false; mensaje: string };

function error(detalle: string): ResultadoArgumentos {
  return { ok: false, mensaje: `${detalle}\n\n${MENSAJE_USO}` };
}

/** Parses and validates the command line (pnpm may prepend a literal "--"). Never throws. */
export function parsearArgumentos(argv: string[]): ResultadoArgumentos {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  let valores: Record<string, string | undefined>;
  try {
    ({ values: valores } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        desde: { type: 'string' },
        hasta: { type: 'string' },
        carrera: { type: 'string' },
        semestre: { type: 'string' },
        grupo: { type: 'string' },
        tipo: { type: 'string' },
        plantel: { type: 'string' },
        csv: { type: 'string' },
      },
    }));
  } catch (e) {
    return error(e instanceof Error ? e.message.split('. To specify')[0]! : 'Argumentos inválidos.');
  }

  const resultado = esquema.safeParse(valores);
  if (!resultado.success) return error(resultado.error.issues.map((i) => i.message).join('\n'));
  const limpio = Object.fromEntries(Object.entries(resultado.data).filter(([, v]) => v !== undefined));
  return { ok: true, valor: limpio as ArgsMetricas };
}
