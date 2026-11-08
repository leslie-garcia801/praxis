import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { generarPasswordTemporal } from '../../lib/passwordTemporal.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { CrearUsuarioVinculacionInput } from './usuarios.schemas.js';

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
