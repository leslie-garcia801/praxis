import { randomUUID } from 'node:crypto';
import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { generarPasswordTemporal } from '../../lib/passwordTemporal.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';

const CREDENTIAL = 'credential';

// RF-04: any vinculación user (or the admin) of the student's campus may reset it. This is support,
// not case-file management, so RN-03b's office scope does not apply (decision 2026-11-07).
// It also creates the account if the student never activated it (e.g. their name did not match).
export async function restablecerContrasena(actor: AuthUser, alumnoId: string): Promise<string> {
  const alumno = await prisma.alumno.findUnique({
    where: { id: alumnoId },
    select: { usuario: { select: { id: true, plantelId: true } } },
  });
  // Students of another campus are reported as missing, not forbidden.
  if (!alumno || alumno.usuario.plantelId !== actor.plantelId) throw AppError.notFound('Alumno no encontrado.');

  const userId = alumno.usuario.id;
  const passwordTemporal = generarPasswordTemporal();
  const passwordHash = await hashPassword(passwordTemporal);

  await prisma.$transaction(async (tx) => {
    const cuenta = await tx.account.findFirst({ where: { userId, providerId: CREDENTIAL }, select: { id: true } });
    if (cuenta) {
      await tx.account.update({ where: { id: cuenta.id }, data: { password: passwordHash } });
    } else {
      await tx.account.create({
        data: { id: randomUUID(), accountId: userId, providerId: CREDENTIAL, userId, password: passwordHash },
      });
    }
    await tx.user.update({ where: { id: userId }, data: { debeCambiar: true } });
    // Whoever had the old password loses access right away.
    await tx.session.deleteMany({ where: { userId } });
    await tx.auditLog.create({
      data: {
        usuarioId: actor.id,
        accion: 'RESTABLECER_CONTRASENA',
        entidad: 'User',
        entidadId: userId,
        despues: { debeCambiar: true, cuentaCreada: !cuenta },
      },
    });
  });

  return passwordTemporal;
}
