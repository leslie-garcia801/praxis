import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { generarPasswordTemporal } from '../../lib/passwordTemporal.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { CrearUsuarioVinculacionInput, EditarUsuarioInput } from './usuarios.schemas.js';

const correoEnUso = () => new AppError(409, 'CORREO_EN_USO', 'Ese correo ya está registrado en otra cuenta.');

// RN-03b: the admin creates vinculación users scoped to one office (or both, when oficina is null)
// on their own campus. The temporary password is returned once and must be changed (RF-04).
export async function crearUsuarioVinculacion(admin: AuthUser, { nombre, email, oficina }: CrearUsuarioVinculacionInput) {
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw correoEnUso();

  const passwordTemporal = generarPasswordTemporal();
  const passwordHash = await hashPassword(passwordTemporal);
  const id = randomUUID();

  try {
    const [usuario] = await prisma.$transaction([
      prisma.user.create({
        data: {
          id,
          name: nombre,
          email,
          plantelId: admin.plantelId,
          rol: 'VINCULACION',
          oficina,
          debeCambiar: true,
          accounts: { create: { id: randomUUID(), accountId: id, providerId: 'credential', password: passwordHash } },
        },
        select: { id: true, name: true, email: true, rol: true, oficina: true },
      }),
      prisma.auditLog.create({
        data: {
          usuarioId: admin.id,
          accion: 'CREAR_USUARIO',
          entidad: 'User',
          entidadId: id,
          despues: { email, rol: 'VINCULACION', oficina, plantelId: admin.plantelId },
        },
      }),
    ]);

    return {
      usuario: { id: usuario.id, nombre: usuario.name, email: usuario.email, rol: usuario.rol, oficina: usuario.oficina },
      passwordTemporal,
    };
  } catch (err) {
    // Two requests with the same email at once: the unique index decides.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw correoEnUso();
    throw err;
  }
}

const CREDENTIAL = 'credential';
const ROLES_PERSONAL = ['VINCULACION', 'ADMIN'] as const;

const SELECT_ITEM = { id: true, name: true, email: true, rol: true, oficina: true, activo: true, debeCambiar: true, createdAt: true } as const;
type FilaUsuario = Prisma.UserGetPayload<{ select: typeof SELECT_ITEM }>;

// Only what the admin screen needs: no hashes, accounts or sessions.
function aItem(u: FilaUsuario) {
  return {
    id: u.id,
    nombre: u.name,
    email: u.email,
    rol: u.rol,
    oficina: u.oficina,
    activo: u.activo,
    debeCambiar: u.debeCambiar,
    creadoEn: u.createdAt.toISOString(),
  };
}

// Staff (vinculación and admins, never students) of the admin's campus; anything else is reported as missing.
async function buscarPersonal(tx: Prisma.TransactionClient, admin: AuthUser, id: string) {
  const usuario = await tx.user.findFirst({
    where: { id, plantelId: admin.plantelId, rol: { in: [...ROLES_PERSONAL] } },
    select: SELECT_ITEM,
  });
  if (!usuario) throw AppError.notFound('Usuario no encontrado.');
  return usuario;
}

// §4: staff of the admin's campus, active users first and then by name.
export async function listarUsuarios(admin: AuthUser) {
  const usuarios = await prisma.user.findMany({
    where: { plantelId: admin.plantelId, rol: { in: [...ROLES_PERSONAL] } },
    select: SELECT_ITEM,
    orderBy: [{ activo: 'desc' }, { name: 'asc' }, { id: 'asc' }],
  });
  return usuarios.map(aItem);
}

// §4: edit name, office (RN-03b) and active flag. Changing the office changes what that user sees right away,
// because the office is read from the user on every request. Deactivating signs the user out.
// RF-29: audits previous and new values of what changed.
export async function editarUsuario(admin: AuthUser, id: string, input: EditarUsuarioInput) {
  return prisma.$transaction(async (tx) => {
    const actual = await buscarPersonal(tx, admin, id);

    if (input.oficina !== undefined && actual.rol === 'ADMIN') {
      throw new AppError(400, 'OFICINA_NO_APLICA', 'La oficina solo aplica a usuarios de vinculación.');
    }

    const desactiva = input.activo === false;
    if (desactiva && actual.id === admin.id) {
      throw new AppError(409, 'NO_PUEDES_DESACTIVARTE', 'No puedes desactivar tu propia cuenta.');
    }
    if (desactiva && actual.activo && actual.rol === 'ADMIN') {
      // Lock the campus admins in a fixed order so two admins deactivating each other at once are serialized.
      await tx.$queryRaw`SELECT id FROM users WHERE plantel_id = ${admin.plantelId} AND rol = 'ADMIN' ORDER BY id FOR UPDATE`;
      const otros = await tx.user.count({ where: { plantelId: admin.plantelId, rol: 'ADMIN', activo: true, id: { not: id } } });
      if (otros === 0) {
        throw new AppError(409, 'ULTIMO_ADMIN', 'No puedes desactivar al último administrador activo del plantel.');
      }
    }

    const antes = { nombre: actual.name, oficina: actual.oficina, activo: actual.activo };
    const despues = {
      nombre: input.nombre ?? antes.nombre,
      oficina: input.oficina === undefined ? antes.oficina : input.oficina,
      activo: input.activo ?? antes.activo,
    };
    const cambios = (['nombre', 'oficina', 'activo'] as const).filter((c) => antes[c] !== despues[c]);
    if (cambios.length === 0) return aItem(actual);

    const nuevo = await tx.user.update({
      where: { id },
      data: { name: despues.nombre, oficina: despues.oficina, activo: despues.activo },
      select: SELECT_ITEM,
    });
    if (actual.activo && !nuevo.activo) await tx.session.deleteMany({ where: { userId: id } });
    await tx.auditLog.create({
      data: {
        usuarioId: admin.id,
        accion: 'EDITAR_USUARIO',
        entidad: 'User',
        entidadId: id,
        antes: Object.fromEntries(cambios.map((c) => [c, antes[c]])),
        despues: Object.fromEntries(cambios.map((c) => [c, despues[c]])),
      },
    });
    return aItem(nuevo);
  });
}

// RF-04: the admin resets the password of another staff member of the campus. A deactivated user may be reset
// too, so the new password is ready when they are reactivated. The password never reaches the audit log.
export async function restablecerContrasenaUsuario(admin: AuthUser, id: string): Promise<string> {
  const passwordTemporal = generarPasswordTemporal();
  const passwordHash = await hashPassword(passwordTemporal);

  await prisma.$transaction(async (tx) => {
    await buscarPersonal(tx, admin, id);
    if (id === admin.id) {
      throw new AppError(409, 'USA_CAMBIAR_CONTRASENA', 'Para cambiar tu propia contraseña usa "Cambiar contraseña".');
    }

    const { count } = await tx.account.updateMany({ where: { userId: id, providerId: CREDENTIAL }, data: { password: passwordHash } });
    if (count === 0) {
      await tx.account.create({ data: { id: randomUUID(), accountId: id, providerId: CREDENTIAL, userId: id, password: passwordHash } });
    }
    await tx.user.update({ where: { id }, data: { debeCambiar: true } });
    // Whoever had the old password loses access right away.
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.auditLog.create({
      data: {
        usuarioId: admin.id,
        accion: 'RESTABLECER_CONTRASENA',
        entidad: 'User',
        entidadId: id,
        despues: { debeCambiar: true },
      },
    });
  });

  return passwordTemporal;
}
