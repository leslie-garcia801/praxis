import { estimarFechaTermino, DIAS_VENTANA_PROMEDIO } from '../../domain/horas.js';
import { alcanceOficina, type TipoPrograma } from '../../domain/oficinas.js';
import { evaluarRiesgo, limiteExpediente, type NivelRiesgo } from '../../domain/riesgo.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { diasEntre, fechaLocal, sumarDias, ZONA_APP, type FechaISO } from '../../lib/tiempo.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { ListarPanelQuery } from './panel.schemas.js';

// RN-18 / RF-24: how long a week may wait for validation, and how long a student may go without registering.
const DIAS_ALERTA = 7;
const MS_DIA = 86_400_000;

type EstadoExpediente = 'PENDIENTE' | 'EN_PROCESO' | 'SUSPENDIDO' | 'FINALIZADO' | 'CANCELADO';
const TODOS_LOS_ESTADOS: EstadoExpediente[] = ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO', 'FINALIZADO', 'CANCELADO'];
const ESTADOS_POR_DEFECTO: EstadoExpediente[] = ['EN_PROCESO', 'SUSPENDIDO'];
// The alerts always look at these states, whatever the table filter says.
const ESTADOS_ALERTAS: EstadoExpediente[] = ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'];

// One row per case file of the office: static data, supervisor and the aggregated attendance figures (query 1).
type FilaBase = {
  id: string;
  tipo: TipoPrograma;
  estado: EstadoExpediente;
  meta_horas: number;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  institucion_id: string | null;
  institucion_nombre: string | null;
  supervisor_id: string | null;
  supervisor_nombre: string | null;
  supervisor_confirmado: boolean | null;
  alumno_id: string;
  alumno_nombre: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  matricula: string | null;
  carrera_id: string;
  carrera_nombre: string;
  semestre: number;
  grupo: string;
  turno: 'MATUTINO' | 'VESPERTINO';
  validados: number;
  registrados: number;
  ultimo_registro: Date | null;
  semanas_enviadas: number;
  semanas_vencidas: number;
  turnos_incompletos: number;
};

type FilaDia = { expediente_id: string; dia: string; minutos: number; primer_dia: string };

// Query 1 (specs §8.4 in SQL): validated = weeks VALIDADA + minutosTransferidos; registered = everything not in a
// validated week. Weeks are counted in subqueries so the attendance join cannot multiply them.
async function consultarBase(plantelId: string, tipos: TipoPrograma[], estados: EstadoExpediente[], hace7Dias: Date) {
  return prisma.$queryRaw<FilaBase[]>(Prisma.sql`
    SELECT
      e.id,
      e.tipo::text AS tipo,
      e.estado::text AS estado,
      e.meta_horas,
      e.fecha_inicio::text AS fecha_inicio,
      e.fecha_termino::text AS fecha_termino,
      e.institucion_id,
      i.nombre AS institucion_nombre,
      e.supervisor_id,
      NULLIF(CONCAT_WS(' ', su.nombre, su.apellido_paterno, su.apellido_materno), '') AS supervisor_nombre,
      su.confirmado AS supervisor_confirmado,
      al.id AS alumno_id,
      al.nombre AS alumno_nombre,
      al.apellido_paterno,
      al.apellido_materno,
      u.username AS matricula,
      al.carrera_id,
      c.nombre AS carrera_nombre,
      al.semestre,
      al.grupo,
      al.turno::text AS turno,
      (e.minutos_transferidos + COALESCE(SUM(a.minutos_acreditables) FILTER (WHERE s.estado = 'VALIDADA'), 0))::int AS validados,
      COALESCE(SUM(a.minutos_acreditables) FILTER (WHERE s.id IS NULL OR s.estado <> 'VALIDADA'), 0)::int AS registrados,
      MAX(a.entrada) AS ultimo_registro,
      (SELECT COUNT(*) FROM semanas_bitacora sb WHERE sb.expediente_id = e.id AND sb.estado = 'ENVIADA')::int AS semanas_enviadas,
      (SELECT COUNT(*) FROM semanas_bitacora sb
         WHERE sb.expediente_id = e.id AND sb.estado = 'ENVIADA' AND sb.enviada_en < ${hace7Dias})::int AS semanas_vencidas,
      COUNT(a.id) FILTER (WHERE a.estado = 'INCOMPLETA')::int AS turnos_incompletos
    FROM expedientes e
    JOIN alumnos al ON al.id = e.alumno_id
    JOIN users u ON u.id = al.usuario_id
    JOIN carreras c ON c.id = al.carrera_id
    LEFT JOIN instituciones i ON i.id = e.institucion_id
    LEFT JOIN supervisores su ON su.id = e.supervisor_id
    LEFT JOIN asistencias a ON a.expediente_id = e.id
    LEFT JOIN semanas_bitacora s ON s.id = a.semana_id
    WHERE u.plantel_id = ${plantelId}
      AND e.tipo::text IN (${Prisma.join(tipos)})
      AND e.estado::text IN (${Prisma.join(estados)})
    GROUP BY e.id, i.nombre, su.id, al.id, u.username, c.nombre
  `);
}

// Query 2: credited minutes per case file and local day (RN-15) inside the estimate window, plus the day of the
// first-ever credited record, which RN-16 needs for the denominator of the average.
async function consultarDias(expedienteIds: string[], inicioVentana: FechaISO) {
  if (expedienteIds.length === 0) return [];
  return prisma.$queryRaw<FilaDia[]>(Prisma.sql`
    WITH dias AS (
      SELECT a.expediente_id, (a.entrada AT TIME ZONE ${ZONA_APP})::date AS dia, SUM(a.minutos_acreditables)::int AS minutos
      FROM asistencias a
      WHERE a.expediente_id IN (${Prisma.join(expedienteIds)})
        AND a.estado = 'CERRADA' AND a.minutos_acreditables > 0
      GROUP BY a.expediente_id, 2
    ), primero AS (
      SELECT expediente_id, MIN(dia) AS primer_dia FROM dias GROUP BY expediente_id
    )
    SELECT d.expediente_id, d.dia::text AS dia, d.minutos, p.primer_dia::text AS primer_dia
    FROM dias d
    JOIN primero p ON p.expediente_id = d.expediente_id
    WHERE d.dia >= ${inicioVentana}::date OR d.dia = p.primer_dia
  `);
}

const nombreCompleto = (f: FilaBase) => [f.alumno_nombre, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ');

// RF-23, RF-24, RN-03b, RN-06a: the office table with its filters and the office alerts. `ahora` is injectable.
export async function listarPanelAlumnos(user: AuthUser, filtros: ListarPanelQuery, ahora: () => Date = () => new Date()) {
  const alcance = alcanceOficina(user);
  if (filtros.tipo && !alcance.includes(filtros.tipo)) throw AppError.forbidden();

  const ahoraFecha = ahora();
  const hoy = fechaLocal(ahoraFecha);
  const estadosTabla = !filtros.estado ? ESTADOS_POR_DEFECTO : filtros.estado === 'TODOS' ? TODOS_LOS_ESTADOS : [filtros.estado];
  const estadosConsulta = filtros.estado === 'TODOS' ? TODOS_LOS_ESTADOS : [...new Set([...estadosTabla, ...ESTADOS_ALERTAS])];

  const base = await consultarBase(user.plantelId, alcance, estadosConsulta, new Date(ahoraFecha.getTime() - DIAS_ALERTA * MS_DIA));

  const alertas = calcularAlertas(base, hoy);

  const visibles = base.filter(
    (f) =>
      estadosTabla.includes(f.estado) &&
      (!filtros.tipo || f.tipo === filtros.tipo) &&
      (!filtros.carreraId || f.carrera_id === filtros.carreraId) &&
      (filtros.semestre === undefined || f.semestre === filtros.semestre) &&
      (!filtros.grupo || f.grupo === filtros.grupo) &&
      (!filtros.turno || f.turno === filtros.turno) &&
      (!filtros.institucionId || f.institucion_id === filtros.institucionId),
  );

  const inicioVentana = sumarDias(hoy, -(DIAS_VENTANA_PROMEDIO - 1));
  const dias = await consultarDias(
    visibles.map((f) => f.id),
    inicioVentana,
  );
  const diasPorExpediente = new Map<string, Record<FechaISO, number>>();
  for (const { expediente_id, dia, minutos, primer_dia } of dias) {
    const mapa = diasPorExpediente.get(expediente_id) ?? {};
    mapa[dia] = Number(minutos);
    // The first-ever day only matters for the average's denominator; when it is outside the window it must still exist.
    mapa[primer_dia] ??= 1;
    diasPorExpediente.set(expediente_id, mapa);
  }

  const alumnos = visibles
    .map((f) => {
      const metaMinutos = f.meta_horas * 60;
      const validados = Number(f.validados);
      const registrados = Number(f.registrados);
      const inicio = f.fecha_inicio;
      const termino = f.fecha_termino;
      // RN-16: registered minutes count as done for the estimate; only validated ones finish the case file.
      const estimacion = estimarFechaTermino({
        minutosFaltantes: Math.max(0, metaMinutos - validados - registrados),
        minutosPorDia: diasPorExpediente.get(f.id) ?? {},
        hoy: ahoraFecha,
      });
      const riesgo = evaluarRiesgo({
        tipo: f.tipo,
        fechaInicio: inicio,
        fechaTermino: termino,
        estimacion,
        completado: validados >= metaMinutos,
        hoy,
      });
      return {
        expediente: { id: f.id, tipo: f.tipo, estado: f.estado, fechaInicio: inicio, fechaTermino: termino },
        alumno: {
          id: f.alumno_id,
          nombre: nombreCompleto(f),
          matricula: f.matricula,
          carrera: f.carrera_nombre,
          semestre: f.semestre,
          grupo: f.grupo,
          turno: f.turno,
        },
        institucion: f.institucion_id ? { id: f.institucion_id, nombre: f.institucion_nombre! } : null,
        minutosValidados: validados,
        metaMinutos,
        porcentaje: Math.min(100, Math.floor((validados * 100) / metaMinutos)),
        minutosRegistrados: registrados,
        ultimoRegistro: f.ultimo_registro,
        semanasPendientes: Number(f.semanas_enviadas),
        fechaEstimada: estimacion.tipo === 'ESTIMADA' ? estimacion.fecha : null,
        limite: limiteExpediente({ tipo: f.tipo, fechaInicio: inicio, fechaTermino: termino }),
        riesgo: riesgo as NivelRiesgo,
        apellidos: `${f.apellido_paterno} ${f.apellido_materno ?? ''} ${f.alumno_nombre}`,
      };
    })
    .filter((f) => !filtros.riesgo || f.riesgo === filtros.riesgo)
    // At risk first, then by surname.
    .sort(
      (a, b) =>
        Number(b.riesgo === 'EN_RIESGO') - Number(a.riesgo === 'EN_RIESGO') ||
        a.apellidos.localeCompare(b.apellidos, 'es') ||
        a.expediente.id.localeCompare(b.expediente.id),
    )
    .map(({ apellidos: _apellidos, ...fila }) => fila);

  return { alumnos, alertas };
}

// RF-24: counted over the whole office (never over the table filters).
function calcularAlertas(base: FilaBase[], hoy: FechaISO) {
  const enMarcha = base.filter((f) => f.estado === 'EN_PROCESO' || f.estado === 'SUSPENDIDO');

  // EN_PROCESO students without a record in the last 7 days; one who never registered counts from their start date.
  const sinRegistros = base
    .filter((f) => {
      if (f.estado !== 'EN_PROCESO') return false;
      const referencia = f.ultimo_registro ? fechaLocal(f.ultimo_registro) : f.fecha_inicio;
      return referencia !== null && diasEntre(referencia, hoy) >= DIAS_ALERTA;
    })
    .map((f) => f.id);

  const conSemanasVencidas = enMarcha.filter((f) => Number(f.semanas_vencidas) > 0);
  const conTurnosIncompletos = enMarcha.filter((f) => Number(f.turnos_incompletos) > 0);

  const porSupervisor = new Map<string, { id: string; nombre: string; institucion: { id: string; nombre: string }; expedienteIds: string[] }>();
  for (const f of base) {
    if (!f.supervisor_id || f.supervisor_confirmado !== false || !ESTADOS_ALERTAS.includes(f.estado)) continue;
    const supervisor = porSupervisor.get(f.supervisor_id) ?? {
      id: f.supervisor_id,
      nombre: f.supervisor_nombre ?? '',
      institucion: { id: f.institucion_id ?? '', nombre: f.institucion_nombre ?? '' },
      expedienteIds: [],
    };
    supervisor.expedienteIds.push(f.id);
    porSupervisor.set(f.supervisor_id, supervisor);
  }
  const supervisores = [...porSupervisor.values()]
    .map((s) => ({ ...s, expedienteIds: s.expedienteIds.sort() }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id));

  return {
    sinRegistros: { total: sinRegistros.length, expedienteIds: sinRegistros },
    semanasSinValidar: {
      total: conSemanasVencidas.reduce((suma, f) => suma + Number(f.semanas_vencidas), 0),
      expedienteIds: conSemanasVencidas.map((f) => f.id),
    },
    turnosIncompletos: {
      total: conTurnosIncompletos.reduce((suma, f) => suma + Number(f.turnos_incompletos), 0),
      expedienteIds: conTurnosIncompletos.map((f) => f.id),
    },
    supervisoresSinConfirmar: { total: supervisores.length, supervisores },
  };
}

