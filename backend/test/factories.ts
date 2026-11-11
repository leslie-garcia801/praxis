import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import type { Prisma } from '../src/generated/prisma/client.js';
import type { EstadoAsistencia, EstadoExpediente, EstadoValidacion, Rol, TipoPrograma } from '../src/generated/prisma/enums.js';
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

export async function crearCarreraPrueba(nombre = 'Programación') {
  return prisma.carrera.create({ data: { nombre: `${CARRERA_PRUEBA} ${nombre} ${randomUUID()}` } });
}

type CrearInstitucionInput = {
  plantelId: string;
  nombre?: string;
  // Any other column (municipio, cupo, activa, ...); wins over the defaults.
  datos?: Partial<Omit<Prisma.InstitucionUncheckedCreateInput, 'plantelId' | 'nombre' | 'carreras'>>;
  carreraIds?: string[];
};

export async function crearInstitucion({ plantelId, nombre = 'Institución de prueba', datos = {}, carreraIds = [] }: CrearInstitucionInput) {
  const id = randomUUID();
  return prisma.institucion.create({
    data: {
      id,
      plantelId,
      nombre,
      calle: 'Av. Principal 100',
      municipio: 'Monterrey',
      qrTokenHash: `hash-${id}`,
      codigoCorto: id.slice(0, 6).toUpperCase(),
      ...datos,
      carreras: { create: carreraIds.map((carreraId) => ({ carreraId })) },
    },
  });
}

type CrearSupervisorInput = {
  institucionId: string;
  // Any other column (confirmado, puesto, telefono, ...); wins over the defaults.
  datos?: Partial<Omit<Prisma.SupervisorUncheckedCreateInput, 'institucionId'>>;
};

export async function crearSupervisor({ institucionId, datos = {} }: CrearSupervisorInput) {
  return prisma.supervisor.create({
    data: {
      institucionId,
      nombre: 'Laura',
      apellidoPaterno: 'Mendoza',
      correo: `supervisor-${randomUUID()}@empresa.invalid`,
      confirmado: true,
      ...datos,
    },
  });
}

type CrearExpedienteInput = {
  alumnoId: string;
  tipo?: TipoPrograma;
  estado?: EstadoExpediente;
  institucionId?: string | null;
  fechaInicio?: Date | null;
  semestre?: number;
  // Any other column (supervisorId, fechaTermino, horaEntrada, ...); wins over the defaults.
  datos?: Partial<Omit<Prisma.ExpedienteUncheckedCreateInput, 'alumnoId'>>;
};

export async function crearExpediente({
  alumnoId,
  tipo = 'SERVICIO_SOCIAL',
  estado = 'EN_PROCESO',
  institucionId = null,
  fechaInicio = null,
  semestre = 5,
  datos = {},
}: CrearExpedienteInput) {
  return prisma.expediente.create({
    data: {
      alumnoId,
      tipo,
      estado,
      institucionId,
      fechaInicio,
      semestre,
      metaHoras: tipo === 'SERVICIO_SOCIAL' ? 480 : 240,
      ...datos,
    },
  });
}

type CrearSemanaInput = {
  expedienteId: string;
  // Monday of the week, "YYYY-MM-DD".
  semanaInicio?: string;
  estado?: EstadoValidacion;
  // Minutes credited by the closed attendances of the week (one attendance per entry).
  minutos?: number[];
};

// A logbook week with closed attendances that credit the given minutes.
export async function crearSemana({ expedienteId, semanaInicio = '2026-03-02', estado = 'VALIDADA', minutos = [] }: CrearSemanaInput) {
  const semana = await prisma.semanaBitacora.create({
    data: { expedienteId, semanaInicio: new Date(`${semanaInicio}T00:00:00.000Z`), estado },
  });
  for (const [i, m] of minutos.entries()) {
    const entrada = new Date(`${semanaInicio}T14:00:00.000Z`);
    entrada.setUTCDate(entrada.getUTCDate() + i);
    await prisma.asistencia.create({
      data: {
        id: randomUUID(),
        expedienteId,
        entrada,
        salida: new Date(entrada.getTime() + m * 60_000),
        minutosAcreditables: m,
        estado: 'CERRADA',
        semanaId: semana.id,
      },
    });
  }
  return semana;
}

type CrearAsistenciaInput = {
  expedienteId: string;
  entrada: Date;
  // Length of the shift in minutes; omitted means the shift is still open (ABIERTA).
  minutos?: number;
  estado?: EstadoAsistencia;
  // Minutes credited (defaults to `minutos` for a closed shift).
  minutosAcreditables?: number | null;
  semanaId?: string | null;
  sinConexion?: boolean;
};

// One attendance written straight to the database (no scan, no recalculation).
export async function crearAsistencia({
  expedienteId,
  entrada,
  minutos,
  estado = minutos === undefined ? 'ABIERTA' : 'CERRADA',
  minutosAcreditables,
  semanaId = null,
  sinConexion = false,
}: CrearAsistenciaInput) {
  return prisma.asistencia.create({
    data: {
      id: randomUUID(),
      expedienteId,
      entrada,
      salida: minutos === undefined ? null : new Date(entrada.getTime() + minutos * 60_000),
      minutosAcreditables: minutosAcreditables === undefined ? (estado === 'CERRADA' ? (minutos ?? 0) : null) : minutosAcreditables,
      estado,
      semanaId,
      sinConexion,
    },
  });
}

// Deletes a test campus with its users, students, case files, institutions and audit entries
// (sessions and accounts cascade).
export async function borrarPlantel(plantelId: string) {
  const usuarios = await prisma.user.findMany({ where: { plantelId }, select: { id: true } });
  const ids = usuarios.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { entidadId: { in: ids } } });
  const expedientes = await prisma.expediente.findMany({ where: { alumno: { usuarioId: { in: ids } } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entidadId: { in: expedientes.map((e) => e.id) } } });
  const expedienteIds = expedientes.map((e) => e.id);
  await prisma.asistencia.deleteMany({ where: { expedienteId: { in: expedienteIds } } });
  await prisma.semanaBitacora.deleteMany({ where: { expedienteId: { in: expedienteIds } } });
  await prisma.expediente.deleteMany({ where: { alumno: { usuarioId: { in: ids } } } });
  await prisma.alumno.deleteMany({ where: { usuarioId: { in: ids } } });
  const instituciones = await prisma.institucion.findMany({ where: { plantelId }, select: { id: true } });
  const institucionIds = instituciones.map((i) => i.id);
  await prisma.auditLog.deleteMany({ where: { entidadId: { in: institucionIds } } });
  const supervisores = await prisma.supervisor.findMany({ where: { institucionId: { in: institucionIds } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entidadId: { in: supervisores.map((s) => s.id) } } });
  await prisma.expediente.deleteMany({ where: { institucionId: { in: institucionIds } } });
  await prisma.supervisor.deleteMany({ where: { institucionId: { in: institucionIds } } });
  await prisma.institucionCarrera.deleteMany({ where: { institucionId: { in: institucionIds } } });
  await prisma.institucion.deleteMany({ where: { plantelId } });
  await prisma.user.deleteMany({ where: { plantelId } });
  await prisma.plantel.deleteMany({ where: { id: plantelId } });
  await prisma.carrera.deleteMany({ where: { nombre: { startsWith: CARRERA_PRUEBA }, alumnos: { none: {} }, instituciones: { none: {} } } });
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
