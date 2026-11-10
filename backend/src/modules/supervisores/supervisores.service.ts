import { randomUUID } from 'node:crypto';
import type { Prisma, Supervisor } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { CrearSupervisorInput, EditarSupervisorInput } from './supervisores.schemas.js';

// RN-03: the active states of a case file.
const ESTADOS_ACTIVOS = ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'] as const;

const CAMPOS_EDITABLES = ['nombre', 'apellidoPaterno', 'correo', 'titulo', 'apellidoMaterno', 'puesto', 'departamento', 'telefono', 'extension'] as const;

// Students never see correo, telefono or extension (decision 2026-11-10). `confirmado` stays visible
// so the app can mark a supervisor that is still pending review.
export function aRespuestaSupervisor(s: Supervisor, user: Pick<AuthUser, 'rol'>) {
  const limitada = {
    id: s.id,
    institucionId: s.institucionId,
    titulo: s.titulo,
    nombre: s.nombre,
    apellidoPaterno: s.apellidoPaterno,
    apellidoMaterno: s.apellidoMaterno,
    puesto: s.puesto,
    departamento: s.departamento,
    confirmado: s.confirmado,
  };
  if (user.rol === 'ALUMNO') return limitada;
  return { ...limitada, correo: s.correo, telefono: s.telefono, extension: s.extension };
}

const instantanea = (s: Supervisor) => Object.fromEntries(CAMPOS_EDITABLES.map((c) => [c, s[c]]));

// RF-05: a student only sees active institutions; anything outside the plantel does not exist.
async function institucionVisible(user: AuthUser, id: string) {
  const institucion = await prisma.institucion.findFirst({
    where: { id, plantelId: user.plantelId, ...(user.rol === 'ALUMNO' && { activa: true }) },
    select: { id: true },
  });
  if (!institucion) throw AppError.notFound('La institución no existe.');
}

// RF-09: staff sees every supervisor of the institution. A student only sees confirmed ones, plus the one
// already chosen on their own active case file even while it is pending.
export async function listarSupervisores(user: AuthUser, institucionId: string) {
  await institucionVisible(user, institucionId);

  let where: Prisma.SupervisorWhereInput = { institucionId };
  if (user.rol === 'ALUMNO') {
    const propio = await prisma.expediente.findFirst({
      where: { alumno: { usuarioId: user.id }, estado: { in: [...ESTADOS_ACTIVOS] }, supervisorId: { not: null }, institucionId },
      select: { supervisorId: true },
    });
    where = { institucionId, OR: [{ confirmado: true }, ...(propio?.supervisorId ? [{ id: propio.supervisorId }] : [])] };
  }

  const filas = await prisma.supervisor.findMany({ where });
  return filas
    .sort((a, b) => `${a.apellidoPaterno} ${a.nombre}`.localeCompare(`${b.apellidoPaterno} ${b.nombre}`, 'es'))
    .map((s) => aRespuestaSupervisor(s, user));
}

// RF-09: a student registers a missing supervisor as pending; vinculación and admin register it confirmed.
export async function crearSupervisor(user: AuthUser, institucionId: string, input: CrearSupervisorInput) {
  await institucionVisible(user, institucionId);

  const id = randomUUID();
  const confirmado = user.rol !== 'ALUMNO';
  const datos = { ...input, institucionId, confirmado };
  const [creado] = await prisma.$transaction([
    prisma.supervisor.create({ data: { id, ...datos } }),
    prisma.auditLog.create({
      data: { usuarioId: user.id, accion: 'CREAR_SUPERVISOR', entidad: 'Supervisor', entidadId: id, despues: datos },
    }),
  ]);
  return aRespuestaSupervisor(creado, user);
}

// RF-09: partial edit by staff of the same plantel. RF-29: audits previous and new values of what changed.
export async function editarSupervisor(user: AuthUser, id: string, input: EditarSupervisorInput) {
  const actualizado = await prisma.$transaction(async (tx) => {
    const actual = await tx.supervisor.findFirst({ where: { id, institucion: { plantelId: user.plantelId } } });
    if (!actual) throw AppError.notFound('El supervisor no existe.');

    const nuevo = await tx.supervisor.update({ where: { id }, data: input });

    const antes = instantanea(actual);
    const despues = instantanea(nuevo);
    const cambios = CAMPOS_EDITABLES.filter((c) => antes[c] !== despues[c]);
    if (cambios.length > 0) {
      await tx.auditLog.create({
        data: {
          usuarioId: user.id,
          accion: 'EDITAR_SUPERVISOR',
          entidad: 'Supervisor',
          entidadId: id,
          antes: Object.fromEntries(cambios.map((c) => [c, antes[c]])),
          despues: Object.fromEntries(cambios.map((c) => [c, despues[c]])),
        },
      });
    }
    return nuevo;
  });
  return aRespuestaSupervisor(actualizado, user);
}
