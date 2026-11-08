import { randomUUID } from 'node:crypto';
import { nombresCoinciden } from '../../domain/nombres.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import type { ActivarInput, VerificarInput } from './activacion.schemas.js';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Db = typeof prisma | Tx;

const CREDENTIAL = 'credential';

// Checks are ordered so that nothing about an account (not even whether it is activated)
// is revealed until the caller proves the name. The stored name is never returned (RNF-07).
async function verificarIdentidad(db: Db, { matricula, nombre, apellidoPaterno }: VerificarInput) {
  const user = await db.user.findUnique({
    where: { username: matricula },
    include: { alumno: true, accounts: { where: { providerId: CREDENTIAL }, select: { id: true } } },
  });
  if (!user || user.rol !== 'ALUMNO' || !user.alumno) {
    throw new AppError(404, 'MATRICULA_NO_REGISTRADA', 'Tu matrícula no está registrada; acude a vinculación.');
  }
  if (!nombresCoinciden(user.alumno, { nombre, apellidoPaterno })) {
    throw new AppError(
      400,
      'NOMBRE_NO_COINCIDE',
      'El nombre no coincide con el registrado. Revisa cómo lo escribiste o acude a vinculación.',
    );
  }
  if (!user.activo) {
    throw new AppError(403, 'CUENTA_INACTIVA', 'Tu cuenta está desactivada. Acude a vinculación.');
  }
  if (user.accounts.length > 0) {
    throw new AppError(409, 'CUENTA_YA_ACTIVADA', 'Tu cuenta ya está activada; inicia sesión.');
  }
  return user;
}

export async function verificarActivacion(input: VerificarInput): Promise<void> {
  await verificarIdentidad(prisma, input);
}

export async function activarCuenta(input: ActivarInput): Promise<void> {
  // Hash outside the transaction: argon2 is deliberately slow.
  const passwordHash = await hashPassword(input.password);
  const email = input.email?.trim().toLowerCase();

  await prisma.$transaction(async (tx) => {
    // Lock the user row so two concurrent activations cannot both create a password.
    await tx.$queryRaw`SELECT id FROM "user" WHERE username = ${input.matricula} FOR UPDATE`;
    const user = await verificarIdentidad(tx, input);

    if (email && email !== user.email) {
      const enUso = await tx.user.findUnique({ where: { email }, select: { id: true } });
      if (enUso) throw new AppError(409, 'CORREO_EN_USO', 'Ese correo ya está registrado en otra cuenta.');
      await tx.user.update({ where: { id: user.id }, data: { email, emailVerified: false } });
    }

    await tx.account.create({
      data: { id: randomUUID(), accountId: user.id, providerId: CREDENTIAL, userId: user.id, password: passwordHash },
    });
    await tx.auditLog.create({
      data: {
        usuarioId: user.id,
        accion: 'ACTIVAR_CUENTA',
        entidad: 'User',
        entidadId: user.id,
        despues: { correoCapturado: Boolean(email) },
      },
    });
  });
}
