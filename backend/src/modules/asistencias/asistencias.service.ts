import { randomUUID } from 'node:crypto';
import { decidirAccion, motivoRechazoExpediente, resolverInstante, type MotivoRechazoExpediente } from '../../domain/asistencias.js';
import { calcularMinutosAcreditables, cerrarTurnoAbierto } from '../../domain/horas.js';
import { hashTokenQr } from '../../domain/qrInstitucion.js';
import type { Asistencia, Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { fechaLocal, inicioDelDiaSiguiente, inicioSemana, instanteLocal, sumarDias } from '../../lib/tiempo.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { EscaneoInput } from './asistencias.schemas.js';

type Tx = Prisma.TransactionClient;

const RECHAZOS: Record<MotivoRechazoExpediente, { code: string; message: string }> = {
  EXPEDIENTE_SUSPENDIDO: {
    code: 'EXPEDIENTE_SUSPENDIDO',
    message: 'Tu expediente está suspendido y no permite registrar asistencia. Acude a vinculación.',
  },
  EXPEDIENTE_NO_ACTIVO: {
    code: 'EXPEDIENTE_NO_ACTIVO',
    message: 'Tu expediente aún no está en proceso, por lo que no puedes registrar asistencia.',
  },
  ANTES_DE_FECHA_INICIO: {
    code: 'ANTES_DE_FECHA_INICIO',
    message: 'Todavía no inicia tu periodo, por lo que no se registró la asistencia.',
  },
};

const conflicto = (code: string, message: string) => new AppError(409, code, message);

export type RespuestaEscaneo = {
  tipo: 'ENTRADA' | 'SALIDA';
  asistencia: {
    id: string;
    entrada: Date;
    salida: Date | null;
    estado: Asistencia['estado'];
    minutosAcreditables: number | null;
    sinConexion: boolean;
  };
  // Minutes worked that day (RN-09 applied, excess included) and credited after the cap (RN-04).
  minutosDia: number;
  minutosAcreditablesDia: number;
  excedente: number;
};

const aAsistencia = (a: Asistencia) => ({
  id: a.id,
  entrada: a.entrada,
  salida: a.salida,
  estado: a.estado,
  minutosAcreditables: a.minutosAcreditables,
  sinConexion: a.sinConexion,
});

// Recomputes RN-04 / RN-09 for every shift that touches the local days between `desde` and `hasta`
// and persists the per-shift values. Returns the summary of the `fechaResumen` day.
async function recalcularDias(tx: Tx, expedienteId: string, desde: string, hasta: string, fechaResumen: string) {
  // One extra day on each side so shifts crossing midnight are split with all their neighbours.
  const inicioVentana = instanteLocal(sumarDias(desde, -1), '00:00');
  const finVentana = inicioDelDiaSiguiente(instanteLocal(sumarDias(hasta, 1), '12:00'));
  const turnos = await tx.asistencia.findMany({
    where: { expedienteId, entrada: { lt: finVentana }, OR: [{ salida: null }, { salida: { gt: inicioVentana } }] },
    orderBy: { entrada: 'asc' },
  });
  const { porTurno, porDia } = calcularMinutosAcreditables(turnos);

  for (const turno of turnos) {
    if (turno.estado !== 'CERRADA' || turno.salida === null) continue;
    const dias = [fechaLocal(turno.entrada), fechaLocal(turno.salida)];
    if (!dias.some((d) => d >= desde && d <= hasta)) continue;
    const minutos = porTurno[turno.id] ?? 0;
    if (turno.minutosAcreditables !== minutos) {
      await tx.asistencia.update({ where: { id: turno.id }, data: { minutosAcreditables: minutos } });
    }
  }

  const dia = porDia[fechaResumen] ?? { minutos: 0, acreditables: 0 };
  return { minutosDia: dia.minutos, minutosAcreditablesDia: dia.acreditables, excedente: dia.minutos - dia.acreditables };
}

// Postgres constraint violations (specs 8.3) are conflicts, never 500s.
function errorDeRestriccion(err: unknown): AppError | null {
  const texto = [err instanceof Error ? err.message : '', JSON.stringify((err as { meta?: unknown })?.meta ?? ''), String((err as { cause?: unknown })?.cause ?? '')].join(' ');
  if (texto.includes('un_turno_abierto')) {
    return conflicto('TURNO_ABIERTO_EXISTENTE', 'Ya tienes un turno abierto. Intenta de nuevo.');
  }
  if (texto.includes('asistencia_sin_traslape')) {
    return conflicto('ASISTENCIA_TRASLAPADA', 'La hora del registro se traslapa con otro turno ya registrado.');
  }
  if (texto.includes('salida_despues_entrada')) {
    return conflicto('SALIDA_ANTERIOR_A_ENTRADA', 'La hora de salida debe ser posterior a la de entrada.');
  }
  if (texto.includes('asistencias_pkey') || texto.includes('asistencias_salida_id_key') || texto.includes('salida_id')) {
    return conflicto('ASISTENCIA_DUPLICADA', 'Este registro ya se está procesando. Intenta de nuevo.');
  }
  return null;
}

// RF-14, RF-15, RN-04, RN-07..RN-10, RN-13, RN-14. `ahora` is injectable for tests.
export async function registrarEscaneo(
  user: AuthUser,
  input: EscaneoInput,
  ahora: () => Date = () => new Date(),
): Promise<RespuestaEscaneo & { creada: boolean }> {
  try {
    return await prisma.$transaction((tx) => escanear(tx, user, input, ahora()));
  } catch (err) {
    throw errorDeRestriccion(err) ?? err;
  }
}

async function escanear(tx: Tx, user: AuthUser, input: EscaneoInput, ahora: Date) {
  // Idempotency: the same client id from the same student returns the stored record.
  // The id may be the entry scan (asistencia.id) or the exit scan (asistencia.salidaId).
  const previa = await tx.asistencia.findFirst({
    where: { OR: [{ id: input.id }, { salidaId: input.id }] },
    include: { expediente: { include: { alumno: true } } },
  });
  if (previa) {
    if (previa.expediente.alumno.usuarioId !== user.id) {
      throw conflicto('ASISTENCIA_ID_EN_USO', 'El identificador del registro ya está en uso.');
    }
    const esSalida = previa.id !== input.id;
    const fecha = fechaLocal(esSalida && previa.salida ? previa.salida : previa.entrada);
    const resumen = await recalcularDias(tx, previa.expedienteId, fecha, fecha, fecha);
    return { creada: false, tipo: esSalida ? ('SALIDA' as const) : ('ENTRADA' as const), asistencia: aAsistencia(previa), ...resumen };
  }

  const alumno = await tx.alumno.findUnique({ where: { usuarioId: user.id }, select: { id: true } });
  if (!alumno) throw AppError.forbidden();
  const expediente = await tx.expediente.findFirst({
    where: { alumnoId: alumno.id, estado: { in: ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'] } },
  });
  if (!expediente) {
    throw conflicto('EXPEDIENTE_NO_ACTIVO', 'No tienes un expediente activo, por lo que no puedes registrar asistencia.');
  }
  const rechazoEstado = motivoRechazoExpediente({ estado: expediente.estado, fechaInicio: null, fechaEscaneo: '' });
  if (rechazoEstado && rechazoEstado !== 'ANTES_DE_FECHA_INICIO') {
    throw conflicto(RECHAZOS[rechazoEstado].code, RECHAZOS[rechazoEstado].message);
  }

  // The token is stored hashed (RNF-06); the short code is compared as typed (uppercase).
  const institucion = await tx.institucion.findUnique({
    where: input.token !== undefined ? { qrTokenHash: hashTokenQr(input.token) } : { codigoCorto: input.codigoCorto! },
    select: { id: true },
  });
  if (!institucion) throw new AppError(404, 'QR_NO_ENCONTRADO', 'El código QR no es válido. Pide a tu supervisor que lo verifique con vinculación.');
  // RN-10
  if (institucion.id !== expediente.institucionId) {
    throw conflicto('QR_DE_OTRA_INSTITUCION', 'Este código QR no corresponde a tu institución.');
  }

  // RN-14, RN-15
  const hora = resolverInstante({ sinConexion: input.sinConexion, hora: input.hora, ahora });
  if (!hora.ok) {
    throw conflicto(
      hora.motivo,
      hora.motivo === 'HORA_ANTIGUA'
        ? 'El registro sin conexión tiene más de 72 horas y ya no se puede enviar. Solicita una corrección a vinculación.'
        : 'La hora del dispositivo está adelantada. Revisa la fecha y hora de tu teléfono.',
    );
  }
  const { instante } = hora;
  const fechaEscaneo = fechaLocal(instante);

  const rechazoFecha = motivoRechazoExpediente({
    estado: expediente.estado,
    fechaInicio: expediente.fechaInicio ? expediente.fechaInicio.toISOString().slice(0, 10) : null,
    fechaEscaneo,
  });
  if (rechazoFecha) throw conflicto(RECHAZOS[rechazoFecha].code, RECHAZOS[rechazoFecha].message);

  const abierto = await tx.asistencia.findFirst({ where: { expedienteId: expediente.id, estado: 'ABIERTA' } });
  const decision = decidirAccion(abierto, instante);

  if (decision.tipo === 'RECHAZO') {
    throw conflicto('ESCANEO_ANTERIOR_AL_TURNO', 'La hora del registro es anterior a la entrada de tu turno abierto.');
  }

  if (decision.tipo === 'SALIDA') {
    const cerrada = await tx.asistencia.update({
      where: { id: abierto!.id },
      data: { salida: instante, estado: 'CERRADA', salidaId: input.id },
    });
    const resumen = await recalcularDias(tx, expediente.id, fechaLocal(cerrada.entrada), fechaEscaneo, fechaEscaneo);
    const actual = await tx.asistencia.findUniqueOrThrow({ where: { id: cerrada.id } });
    return { creada: false, tipo: 'SALIDA' as const, asistencia: aAsistencia(actual), ...resumen };
  }

  // RN-08: the open shift of an earlier day is closed as INCOMPLETA before the new entry.
  if (decision.cerrarAnterior && abierto) {
    const cierre = cerrarTurnoAbierto(abierto.entrada);
    await tx.asistencia.update({
      where: { id: abierto.id },
      data: { salida: cierre.salida, estado: cierre.estado, minutosAcreditables: cierre.minutosAcreditables },
    });
  }
  // RF-19, RN-15: the attendance belongs to the week (Monday to Sunday) of the local day of its entry; the week is
  // created with the first one. Prisma's upsert is not atomic (two concurrent first scans would fail with a unique
  // violation that aborts the transaction), so the insert is ON CONFLICT DO NOTHING followed by a read.
  const inicio = inicioSemana(fechaEscaneo);
  await tx.$executeRaw`
    INSERT INTO "semanas_bitacora" ("id", "expediente_id", "semana_inicio")
    VALUES (${randomUUID()}, ${expediente.id}, ${inicio}::date)
    ON CONFLICT ("expediente_id", "semana_inicio") DO NOTHING`;
  const semana = await tx.semanaBitacora.findUniqueOrThrow({
    where: { expedienteId_semanaInicio: { expedienteId: expediente.id, semanaInicio: new Date(`${inicio}T00:00:00.000Z`) } },
    select: { id: true },
  });
  const nueva = await tx.asistencia.create({
    data: { id: input.id, expedienteId: expediente.id, entrada: instante, estado: 'ABIERTA', sinConexion: input.sinConexion, semanaId: semana.id },
  });
  const resumen = await recalcularDias(tx, expediente.id, fechaEscaneo, fechaEscaneo, fechaEscaneo);
  return { creada: true, tipo: 'ENTRADA' as const, asistencia: aAsistencia(nueva), ...resumen };
}
