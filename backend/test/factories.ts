import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import type { EstadoExpediente, Rol, TipoPrograma } from '../src/generated/prisma/enums.js';
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

type CrearAlumnoInput = {
  plantelId: string;
  matricula: string;
  nombre?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string | null;
  // When given, the account is already activated with this password.
  password?: string;
};

// A student as left by the import (RF-01): user + alumno, no password unless `password` is given.
export async function crearAlumnoPrecargado({
  plantelId,
  matricula,
  nombre = 'Ana María',
  apellidoPaterno = 'López',
  apellidoMaterno = 'García',
  password,
}: CrearAlumnoInput) {
  const id = randomUUID();
  const carrera = await prisma.carrera.create({ data: { nombre: `${CARRERA_PRUEBA} ${randomUUID()}` } });
  return prisma.user.create({
    data: {
      id,
      name: [nombre, apellidoPaterno, apellidoMaterno].filter(Boolean).join(' '),
      email: `${matricula}@alumno.praxis.invalid`,
      username: matricula,
      displayUsername: matricula,
      plantelId,
      ...(password && {
        accounts: {
          create: { id: randomUUID(), accountId: id, providerId: 'credential', password: await hashPassword(password) },
        },
      }),
      alumno: {
        create: {
          nombre,
          apellidoPaterno,
          apellidoMaterno,
          carreraId: carrera.id,
          semestre: 5,
          grupo: 'A',
          turno: 'MATUTINO',
        },
      },
    },
    include: { alumno: true },
  });
}

const CARRERA_PRUEBA = 'Carrera de prueba';

export async function crearInstitucion({ plantelId, nombre = 'Institución de prueba' }: { plantelId: string; nombre?: string }) {
  const id = randomUUID();
  return prisma.institucion.create({
    data: {
      id,
      plantelId,
      nombre,
      calle: 'Av. Principal 100',
      municipio: 'Monterrey',
      qrTokenHash: `hash-${id}`,
      codigoCorto: id.slice(0, 8),
    },
  });
}

type CrearExpedienteInput = {
  alumnoId: string;
  tipo?: TipoPrograma;
  estado?: EstadoExpediente;
  institucionId?: string | null;
  fechaInicio?: Date | null;
};

export async function crearExpediente({
  alumnoId,
  tipo = 'SERVICIO_SOCIAL',
  estado = 'EN_PROCESO',
  institucionId = null,
  fechaInicio = null,
}: CrearExpedienteInput) {
  return prisma.expediente.create({
    data: {
      alumnoId,
      tipo,
      estado,
      institucionId,
      fechaInicio,
      semestre: 5,
      metaHoras: tipo === 'SERVICIO_SOCIAL' ? 480 : 240,
    },
  });
}

// Deletes a test campus with its users, students, case files, institutions and audit entries
// (sessions and accounts cascade).
export async function borrarPlantel(plantelId: string) {
  const usuarios = await prisma.user.findMany({ where: { plantelId }, select: { id: true } });
  const ids = usuarios.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { entidadId: { in: ids } } });
  await prisma.expediente.deleteMany({ where: { alumno: { usuarioId: { in: ids } } } });
  await prisma.alumno.deleteMany({ where: { usuarioId: { in: ids } } });
  await prisma.institucion.deleteMany({ where: { plantelId } });
  await prisma.user.deleteMany({ where: { plantelId } });
  await prisma.plantel.deleteMany({ where: { id: plantelId } });
  await prisma.carrera.deleteMany({ where: { nombre: { startsWith: CARRERA_PRUEBA }, alumnos: { none: {} } } });
}

// Each sign-in uses its own client IP so the sign-in rate limiter never interferes with tests.
let ipCounter = 0;

// Students (with a control number) sign in by username; staff by email.
export async function iniciarSesion(
  app: Express,
  user: { email: string; username?: string | null },
  password = PASSWORD_PRUEBA,
) {
  ipCounter++;
  const [path, body] = user.username
    ? ['/api/auth/sign-in/username', { username: user.username, password }]
    : ['/api/auth/sign-in/email', { email: user.email, password }];
  const res = await request(app)
    .post(path)
    .set('Origin', process.env.FRONTEND_ORIGIN!)
    .set('X-Forwarded-For', `10.200.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`)
    .send(body);
  if (res.status !== 200) throw new Error(`iniciarSesion failed with ${res.status}: ${JSON.stringify(res.body)}`);

  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.map((c) => c.split(';')[0]).join('; ');
}
