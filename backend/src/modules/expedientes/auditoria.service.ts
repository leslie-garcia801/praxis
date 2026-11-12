// RF-29, RF-25: audit trail of one case file for the office. Access follows `cargar` (RN-03b).
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { cargar } from './expedientes.service.js';

// No pagination yet: the newest entries are enough for a review screen. The response says when it was cut.
export const LIMITE_AUDITORIA = 200;

// Entities of the audit log tied to a case file: the case file itself and its weekly logbooks (SemanaBitacora).
// Asistencia and SolicitudCorreccion rows are not audited by the code today, so there is nothing to include.
// Alumno-level data (User) is deliberately left out (RNF-07).
export async function listarAuditoria(user: AuthUser, id: string) {
  await cargar(prisma, user, id);

  const semanas = await prisma.semanaBitacora.findMany({ where: { expedienteId: id }, select: { id: true } });
  const filas = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entidad: 'Expediente', entidadId: id },
        { entidad: 'SemanaBitacora', entidadId: { in: semanas.map((s) => s.id) } },
      ],
    },
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    take: LIMITE_AUDITORIA + 1,
  });
  const truncado = filas.length > LIMITE_AUDITORIA;
  const entradas = filas.slice(0, LIMITE_AUDITORIA);

  const usuarioIds = [...new Set(entradas.map((e) => e.usuarioId).filter((u): u is string => u !== null))];
  const usuarios = await prisma.user.findMany({ where: { id: { in: usuarioIds } }, select: { id: true, name: true } });
  const nombres = new Map(usuarios.map((u) => [u.id, u.name]));

  return {
    limite: LIMITE_AUDITORIA,
    truncado,
    entradas: entradas.map((e) => ({
      id: e.id,
      fecha: e.fecha.toISOString(),
      // A null user is the system or the supervisor acting through a validation link.
      usuario: e.usuarioId ? (nombres.get(e.usuarioId) ?? 'Usuario eliminado') : 'Sistema',
      accion: e.accion,
      entidad: e.entidad,
      antes: e.antes,
      despues: e.despues,
    })),
  };
}
