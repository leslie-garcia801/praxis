import { AppError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthContext } from '../../middleware/auth.js';
import type { CambiarContrasenaInput } from './me.schemas.js';

// RF-04: replaces Better Auth's /change-password so the pending change (debeCambiar) is cleared
// in the same transaction. Keeps the current session and closes the others.
export async function cambiarContrasena(
  { user, sessionId }: AuthContext,
  { passwordActual, passwordNueva }: CambiarContrasenaInput,
): Promise<void> {
  const cuenta = await prisma.account.findFirst({
    where: { userId: user.id, providerId: 'credential' },
    select: { id: true, password: true },
  });
  if (!cuenta?.password || !(await verifyPassword({ hash: cuenta.password, password: passwordActual }))) {
    throw new AppError(400, 'CONTRASENA_ACTUAL_INCORRECTA', 'La contraseña actual no es correcta.');
  }

  const passwordHash = await hashPassword(passwordNueva);

  await prisma.$transaction([
    prisma.account.update({ where: { id: cuenta.id }, data: { password: passwordHash } }),
    prisma.user.update({ where: { id: user.id }, data: { debeCambiar: false } }),
    prisma.session.deleteMany({ where: { userId: user.id, id: { not: sessionId } } }),
    prisma.auditLog.create({
      data: { usuarioId: user.id, accion: 'CAMBIAR_CONTRASENA', entidad: 'User', entidadId: user.id },
    }),
  ]);
}
