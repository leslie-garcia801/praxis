// RF-26: Excel exports of the office panel. They reuse the panel query, so scope (RN-03b), filters and hours are
// exactly what the table shows. Nothing the app does not store (CURP, edad, sexo, afiliación) is exported (RNF-07).
import { formatearDiasPactados } from '../../domain/diasPactados.js';
import { limiteExpediente } from '../../domain/riesgo.js';
import { fechaHoraLocal } from '../../lib/tiempo.js';
import { construirXlsx, type Celda } from '../../lib/xlsx.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { ListarPanelQuery } from './panel.schemas.js';
import { consultarPanel } from './panel.service.js';

const PROGRAMA = { SERVICIO_SOCIAL: 'Servicio social', PRACTICAS: 'Prácticas' } as const;
const ESTADO = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  SUSPENDIDO: 'Suspendido',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
} as const;
const RIESGO = {
  EN_RIESGO: 'En riesgo',
  EN_TIEMPO: 'En tiempo',
  SIN_DATOS: 'Sin datos',
  NO_EVALUABLE: 'No evaluable',
  COMPLETADO: 'Completado',
} as const;

// Hours as a number with one decimal.
const horas = (minutos: number) => Math.round((minutos / 60) * 10) / 10;
const unir = (partes: (string | null | undefined)[], separador: string) => partes.filter(Boolean).join(separador);

const ENCABEZADOS_ALUMNOS = [
  'Número de control',
  'Alumno',
  'Carrera',
  'Semestre',
  'Grupo',
  'Turno',
  'Programa',
  'Estado',
  'Institución',
  'Horas validadas',
  'Meta (h)',
  'Porcentaje',
  'Horas registradas sin validar',
  'Último registro',
  'Semanas pendientes',
  'Fecha estimada',
  'Riesgo',
  'Límite',
];
const ANCHOS_ALUMNOS = [18, 34, 30, 10, 8, 12, 16, 14, 34, 14, 10, 12, 18, 18, 12, 14, 14, 12];

const ENCABEZADOS_EDUMEDIA = [
  'Número de control',
  'Nombre(s)',
  'Apellido paterno',
  'Apellido materno',
  'Carrera',
  'Semestre',
  'Grupo',
  'Programa',
  'Institución',
  'RFC de la institución',
  'Departamento o área',
  'Fecha de inicio',
  'Fecha de término',
  'Días pactados',
  'Hora de entrada',
  'Hora de salida',
  'Programa y subprograma',
  'Supervisor',
  'Puesto del supervisor',
  'Correo del supervisor',
  'Teléfono y extensión del supervisor',
];
const ANCHOS_EDUMEDIA = [18, 20, 18, 18, 30, 10, 8, 16, 34, 18, 24, 14, 14, 18, 12, 12, 30, 34, 22, 30, 24];

// The table as filtered on screen, one sheet "Alumnos".
export async function exportarAlumnosXlsx(user: AuthUser, filtros: ListarPanelQuery, ahora: () => Date = () => new Date()): Promise<Buffer> {
  const { filas } = await consultarPanel(user, filtros, ahora);
  const datos: Celda[][] = filas.map(({ fila: f }) => [
    f.alumno.matricula,
    f.alumno.nombre,
    f.alumno.carrera,
    f.alumno.semestre,
    f.alumno.grupo,
    f.alumno.turno === 'MATUTINO' ? 'Matutino' : 'Vespertino',
    PROGRAMA[f.expediente.tipo],
    ESTADO[f.expediente.estado],
    f.institucion?.nombre ?? '',
    horas(f.minutosValidados),
    f.metaMinutos / 60,
    f.porcentaje,
    horas(f.minutosRegistrados),
    f.ultimoRegistro ? fechaHoraLocal(f.ultimoRegistro) : '',
    f.semanasPendientes,
    f.fechaEstimada ?? '',
    RIESGO[f.riesgo],
    f.limite ?? '',
  ]);
  return construirXlsx([ENCABEZADOS_ALUMNOS, ...datos], 'Alumnos', { anchos: ANCHOS_ALUMNOS, columnasTexto: [0] });
}

// The data Edumedia asks for that the official formats leave empty, one sheet "Edumedia".
export async function exportarEdumediaXlsx(user: AuthUser, filtros: ListarPanelQuery, ahora: () => Date = () => new Date()): Promise<Buffer> {
  const { filas } = await consultarPanel(user, filtros, ahora);
  const datos: Celda[][] = filas.map(({ fila: f, base: b }) => {
    // Servicio social ends at start + 6 months, the same limit the panel uses for "en riesgo" (RN-06a).
    const termino =
      b.tipo === 'PRACTICAS' ? b.fecha_termino : limiteExpediente({ tipo: b.tipo, fechaInicio: b.fecha_inicio, fechaTermino: b.fecha_termino });
    const telefono = unir([b.supervisor_telefono, b.supervisor_extension ? `ext. ${b.supervisor_extension}` : null], ' ');
    return [
      f.alumno.matricula,
      b.alumno_nombre,
      b.apellido_paterno,
      b.apellido_materno ?? '',
      b.carrera_nombre,
      b.semestre,
      b.grupo,
      PROGRAMA[b.tipo],
      b.institucion_nombre ?? '',
      b.institucion_rfc ?? '',
      b.departamento ?? '',
      b.fecha_inicio ?? '',
      termino ?? '',
      formatearDiasPactados(b.dias_pactados ?? []),
      b.hora_entrada ?? '',
      b.hora_salida ?? '',
      unir([b.programa, b.subprograma], ' / '),
      unir([b.supervisor_titulo, b.supervisor_nombre], ' '),
      b.supervisor_puesto ?? '',
      b.supervisor_correo ?? '',
      telefono,
    ];
  });
  return construirXlsx([ENCABEZADOS_EDUMEDIA, ...datos], 'Edumedia', { anchos: ANCHOS_EDUMEDIA, columnasTexto: [0] });
}
