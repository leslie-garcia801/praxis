import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import type { Rol, TipoPrograma } from '../src/generated/prisma/enums.js';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';

export const PASSWORD_PRUEBA = 'Secreta123';

export async function crearPlantel(nombre = `Plantel de prueba ${randomUUID()}`) {
  return prisma.plantel.create({ data: { nombre } });
}

type CrearUsuarioInput = {
  plantelId: string;
  rol?: Rol;
  oficina?: TipoPrograma | null;
  debeCambiar?: boolean;
  activo?: boolean;
  username?: string;
  password?: string;
};

// Creates a user with a credential account, the same shape Better Auth expects.
export async function crearUsuario({
  plantelId,
  rol = 'ALUMNO',
  oficina = null,
  debeCambiar = false,
  activo = true,
  username,
  password = PASSWORD_PRUEBA,
}: CrearUsuarioInput) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      name: `Usuario ${rol.toLowerCase()}`,
      email: `${id}@prueba.praxis.invalid`,
      username: username ?? null,
      displayUsername: username ?? null,
      plantelId,
      rol,
      oficina,
      debeCambiar,
      activo,
      accounts: {
        create: { id: randomUUID(), accountId: id, providerId: 'credential', password: await hashPassword(password) },
      },
    },
  });
}

// Deletes a test campus and its users (sessions and accounts cascade).
export async function borrarPlantel(plantelId: string) {
  await prisma.user.deleteMany({ where: { plantelId } });
  await prisma.plantel.deleteMany({ where: { id: plantelId } });
}

// Each sign-in uses its own client IP so the sign-in rate limiter never interferes with tests.
let ipCounter = 0;

export async function iniciarSesion(app: Express, user: { email: string }, password = PASSWORD_PRUEBA) {
  ipCounter++;
  const res = await request(app)
    .post('/api/auth/sign-in/email')
    .set('Origin', process.env.FRONTEND_ORIGIN!)
    .set('X-Forwarded-For', `10.200.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`)
    .send({ email: user.email, password });
  if (res.status !== 200) throw new Error(`iniciarSesion failed with ${res.status}: ${JSON.stringify(res.body)}`);

  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.map((c) => c.split(';')[0]).join('; ');
}
