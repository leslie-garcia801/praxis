// RF-27: content of the hours and activities report. `construirReporte` is pure (no Prisma, no pdfmake runtime): it
// returns a pdfmake document definition, so tests read the content without parsing PDF bytes.
import type { Content, TableCell } from 'pdfmake';
import type { TDocumentDefinitions } from '../lib/pdf.js';
import { fechaHoraLocal, fechaLocal, sumarDias, type FechaISO } from '../lib/tiempo.js';
import type { TipoPrograma } from './oficinas.js';

const PROGRAMA: Record<TipoPrograma, string> = { SERVICIO_SOCIAL: 'Servicio social', PRACTICAS: 'Prácticas profesionales' };

export type TurnoReporte = {
  entrada: Date;
  salida: Date | null;
  minutosAcreditables: number;
  semanaId: string | null;
};

export type SemanaReporte = {
  id: string;
  /** Monday of the week. */
  semanaInicio: FechaISO;
  estado: string;
  actividades: string | null;
};

export type DatosReporte = {
  plantel: string;
  tipo: TipoPrograma;
  desde: FechaISO | null;
  hasta: FechaISO | null;
  alumno: { nombreCompleto: string; matricula: string; carrera: string; semestre: number; grupo: string };
  institucion: string | null;
  departamento: string | null;
  supervisor: { titulo: string | null; nombreCompleto: string; puesto: string | null } | null;
  /** Any shift of the case file; the builder keeps those of validated weeks inside the range. */
  turnos: TurnoReporte[];
  semanas: SemanaReporte[];
  /** Validated weeks plus transferred minutes, computed by query (specs 8.4). */
  minutosValidadosAcumulados: number;
  metaMinutos: number;
};

/** Minutes as "h:mm" (for example 390 -> "6:30"). */
export function formatearHorasMinutos(minutos: number): string {
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`;
}

/** "2026-03-02" -> "02/03/2026". */
export function formatearFecha(fecha: FechaISO): string {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

const horaLocal = (instante: Date) => fechaHoraLocal(instante).slice(11);

function periodo(desde: FechaISO | null, hasta: FechaISO | null): string {
  if (desde && hasta) return `Del ${formatearFecha(desde)} al ${formatearFecha(hasta)}`;
  if (desde) return `Desde el ${formatearFecha(desde)}`;
  if (hasta) return `Hasta el ${formatearFecha(hasta)}`;
  return 'Todo el expediente';
}

// RN-15: a shift belongs to the local calendar day of its entry.
const enRango = (dia: FechaISO, desde: FechaISO | null, hasta: FechaISO | null) => (!desde || dia >= desde) && (!hasta || dia <= hasta);

/** What the report includes: shifts of validated weeks and those weeks (RF-27), restricted to the range. */
export function seleccionarContenido(datos: Pick<DatosReporte, 'turnos' | 'semanas' | 'desde' | 'hasta'>) {
  const validadas = new Map(datos.semanas.filter((s) => s.estado === 'VALIDADA').map((s) => [s.id, s]));
  const turnos = datos.turnos
    .filter((t) => t.semanaId !== null && validadas.has(t.semanaId) && enRango(fechaLocal(t.entrada), datos.desde, datos.hasta))
    .sort((a, b) => a.entrada.getTime() - b.entrada.getTime());
  // A week is in the range when any of its seven days is.
  const semanas = [...validadas.values()]
    .filter((s) => (!datos.desde || sumarDias(s.semanaInicio, 6) >= datos.desde) && (!datos.hasta || s.semanaInicio <= datos.hasta))
    .sort((a, b) => a.semanaInicio.localeCompare(b.semanaInicio));
  return { turnos, semanas, minutosPeriodo: turnos.reduce((suma, t) => suma + t.minutosAcreditables, 0) };
}

const dato = (etiqueta: string, valor: string | number | null): Content => ({
  text: [{ text: `${etiqueta}: `, bold: true }, String(valor ?? '—')],
  margin: [0, 1, 0, 1],
});

const titulo = (texto: string): Content => ({ text: texto, fontSize: 12, bold: true, margin: [0, 14, 0, 6] });

const celdaEncabezado = (texto: string): TableCell => ({ text: texto, bold: true, fillColor: '#EEEEEE' });

function bloqueFirma(rotulo: string, lineas: string[]): Content {
  return {
    stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.8 }], margin: [0, 48, 0, 4] },
      { text: rotulo, bold: true },
      ...lineas.map((l): Content => ({ text: l, fontSize: 9 })),
    ],
  };
}

export function construirReporte(datos: DatosReporte): TDocumentDefinitions {
  const { turnos, semanas, minutosPeriodo } = seleccionarContenido(datos);
  const programa = PROGRAMA[datos.tipo];
  const supervisor = datos.supervisor;
  const nombreSupervisor = supervisor ? [supervisor.titulo, supervisor.nombreCompleto].filter(Boolean).join(' ') : null;

  const tablaTurnos: Content =
    turnos.length === 0
      ? { text: 'No hay turnos validados en el periodo.', italics: true }
      : {
          table: {
            headerRows: 1,
            widths: ['*', 70, 70, 70],
            body: [
              ['Fecha', 'Entrada', 'Salida', 'Horas'].map(celdaEncabezado),
              ...turnos.map((t): TableCell[] => [
                formatearFecha(fechaLocal(t.entrada)),
                horaLocal(t.entrada),
                t.salida ? horaLocal(t.salida) : '—',
                formatearHorasMinutos(t.minutosAcreditables),
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        };

  const bitacoras: Content[] =
    semanas.length === 0
      ? [{ text: 'No hay bitácoras validadas en el periodo.', italics: true }]
      : semanas.flatMap((s): Content[] => [
          { text: `Semana del ${formatearFecha(s.semanaInicio)} al ${formatearFecha(sumarDias(s.semanaInicio, 6))}`, bold: true, margin: [0, 6, 0, 2] },
          { text: s.actividades?.trim() || 'Sin actividades registradas.', italics: !s.actividades?.trim() },
        ]);

  return {
    pageSize: 'LETTER',
    pageMargins: [54, 54, 54, 54],
    defaultStyle: { font: 'Helvetica', fontSize: 10, color: '#000000' },
    info: { title: `Reporte de horas y actividades - ${datos.alumno.matricula}` },
    content: [
      { text: datos.plantel, fontSize: 14, bold: true, alignment: 'center' },
      { text: `Reporte de horas y actividades - ${programa}`, fontSize: 12, alignment: 'center', margin: [0, 2, 0, 2] },
      { text: `Periodo: ${periodo(datos.desde, datos.hasta)}`, alignment: 'center' },

      titulo('Datos del alumno'),
      dato('Nombre', datos.alumno.nombreCompleto),
      dato('Matrícula', datos.alumno.matricula),
      dato('Carrera', datos.alumno.carrera),
      dato('Semestre', datos.alumno.semestre),
      dato('Grupo', datos.alumno.grupo),

      titulo('Institución'),
      dato('Institución', datos.institucion),
      dato('Departamento o área', datos.departamento),
      dato('Supervisor', nombreSupervisor),
      ...(supervisor?.puesto ? [dato('Puesto', supervisor.puesto)] : []),

      titulo('Turnos validados'),
      tablaTurnos,

      titulo('Bitácoras'),
      ...bitacoras,

      titulo('Totales'),
      dato('Horas acreditadas en el periodo', formatearHorasMinutos(minutosPeriodo)),
      dato(
        'Horas validadas acumuladas',
        `${formatearHorasMinutos(datos.minutosValidadosAcumulados)} de ${formatearHorasMinutos(datos.metaMinutos)} (meta de ${datos.metaMinutos / 60} h)`,
      ),

      {
        columns: [
          bloqueFirma('Supervisor', [nombreSupervisor ?? '', supervisor?.puesto ?? ''].filter(Boolean)),
          bloqueFirma('Oficina de Vinculación', []),
        ],
        columnGap: 24,
        unbreakable: true,
        margin: [0, 24, 0, 0],
      },
    ],
  };
}
