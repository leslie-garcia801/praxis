import { motivoRechazoCorreccion, type MotivoRechazoCorreccion } from '../../domain/correcciones.js';
import type { SolicitudCorreccion } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { cargar } from '../expedientes/expedientes.service.js';
import type { SolicitarCorreccionInput } from './correcciones.schemas.js';

const MENSAJES: Record<MotivoRechazoCorreccion, string> = {
  TURNO_NO_CORREGIBLE: 'Este turno sigue abierto. Registra tu salida en lugar de solicitar una corrección.',
  SEMANA_NO_CORREGIBLE: 'La semana de este turno ya se envió o se validó, por lo que no se puede corregir.',
  EXPEDIENTE_NO_ACTIVO: 'Tu expediente no está en proceso, por lo que no puedes solicitar correcciones.',
  ENTRADA_OTRO_DIA: 'La hora de entrada debe ser del mismo día del turno.',
  SALIDA_ANTERIOR_A_ENTRADA: 'La hora de salida debe ser posterior a la de entrada.',
  HORA_FUTURA: 'La hora de salida no puede estar en el futuro.',
  CORRECCION_SIN_CAMBIOS: 'Las horas propuestas son iguales a las del turno.',
};

const conflicto = (code: string, message: string) => new AppError(409, code, message);
const pendienteExistente = () =>
  conflicto('CORRECCION_PENDIENTE_EXISTENTE', 'Ya hay una solicitud de corrección pendiente para este turno.');

export const aCorreccion = (s: SolicitudCorreccion) => ({
  id: s.id,
  asistenciaId: s.asistenciaId,
  entradaNueva: s.entradaNueva,
  salidaNueva: s.salidaNueva,
  motivo: s.motivo,
  estado: s.estado,
  comentario: s.comentario,
  creadoEn: s.creadoEn,
  resueltoEn: s.resueltoEn,
});

// RF-17: the student asks the office to correct one of their shifts. Nothing changes on the shift until the office
// approves it (task 0038). `ahora` is injectable for tests.
export async function solicitarCorreccion(
  user: AuthUser,
  asistenciaId: string,
  input: SolicitarCorreccionInput,
  ahora: () => Date = () => new Date(),
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const turno = await tx.asistencia.findUnique({ where: { id: asistenciaId }, include: { semana: { select: { estado: true } } } });
      if (!turno) throw AppError.notFound('El turno no existe.');
      // 404 outside the plantel, 403 for another student's shift (RN-03b).
      const expediente = await cargar(tx, user, turno.expedienteId);

      const motivo = motivoRechazoCorreccion({
        estadoTurno: turno.estado,
        estadoSemana: turno.semana?.estado ?? null,
        estadoExpediente: expediente.estado,
        entradaOriginal: turno.entrada,
        salidaOriginal: turno.salida,
        entradaNueva: input.entradaNueva,
        salidaNueva: input.salidaNueva,
        ahora: ahora(),
      });
      if (motivo) throw conflicto(motivo, MENSAJES[motivo]);

      const pendiente = await tx.solicitudCorreccion.findFirst({ where: { asistenciaId, estado: 'PENDIENTE' }, select: { id: true } });
      if (pendiente) throw pendienteExistente();

      // Same rule as the asistencia_sin_traslape constraint (specs 8.3): an open shift extends to infinity.
      const traslape = await tx.asistencia.findFirst({
        where: {
          expedienteId: turno.expedienteId,
          id: { not: asistenciaId },
          entrada: { lt: input.salidaNueva },
          OR: [{ salida: null }, { salida: { gt: input.entradaNueva } }],
        },
        select: { id: true },
      });
      if (traslape) throw conflicto('ASISTENCIA_TRASLAPADA', 'Las horas propuestas se traslapan con otro turno ya registrado.');

      const creada = await tx.solicitudCorreccion.create({
        data: { asistenciaId, entradaNueva: input.entradaNueva, salidaNueva: input.salidaNueva, motivo: input.motivo },
      });
      return aCorreccion(creada);
    });
  } catch (err) {
    // A concurrent request for the same shift hits the partial unique index.
    if (JSON.stringify(err).includes('una_correccion_pendiente') || String(err).includes('una_correccion_pendiente')) {
      throw pendienteExistente();
    }
    throw err;
  }
}
