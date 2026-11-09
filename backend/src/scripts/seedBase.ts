import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import { hashPassword } from '../lib/password.js';
import type { SeedAdmin } from './seedEnv.js';

export const PLANTEL_NOMBRE = 'CBTIS 258';

// Official career catalog of the campus. Student imports must reference one of these (RF-01).
export const CARRERAS = [
  'Programación',
  'Inteligencia Artificial',
  'Ciberseguridad',
  'Logística',
  'Contabilidad',
  'Hospedaje',
  'Alimentos y Bebidas',
  'Mecánica Industrial',
] as const;

export type SeedResult = { plantelCreado: boolean; adminCreado: boolean; carrerasCreadas: number };

// Base data every environment needs. Safe to run repeatedly: existing rows are left untouched,
// so re-running never resets the admin password.
export async function seedBase(prisma: PrismaClient, { admin }: { admin: SeedAdmin }): Promise<SeedResult> {
  const existingPlantel = await prisma.plantel.findFirst({ where: { nombre: PLANTEL_NOMBRE } });
  const plantel = existingPlantel ?? (await prisma.plantel.create({ data: { nombre: PLANTEL_NOMBRE } }));

  const { count: carrerasCreadas } = await prisma.carrera.createMany({
    data: CARRERAS.map((nombre) => ({ nombre })),
    skipDuplicates: true,
  });

  // Better Auth normalizes emails to lowercase on sign-in.
  const email = admin.email.trim().toLowerCase();
  const existingAdmin = await prisma.user.findUnique({ where: { email } });
  if (existingAdmin) return { plantelCreado: !existingPlantel, adminCreado: false, carrerasCreadas };

  const passwordHash = await hashPassword(admin.password);
  const userId = randomUUID();

  await prisma.$transaction([
    prisma.user.create({
      data: {
        id: userId,
        name: admin.nombre,
        email,
        emailVerified: true,
        plantelId: plantel.id,
        rol: 'ADMIN',
        // The initial password is shared out of band, so it must be changed on first sign-in (RF-04).
        debeCambiar: true,
        accounts: {
          create: { id: randomUUID(), accountId: userId, providerId: 'credential', password: passwordHash },
        },
      },
    }),
    prisma.auditLog.create({
      data: {
        accion: 'CREAR_ADMIN',
        entidad: 'User',
        entidadId: userId,
        despues: { email, rol: 'ADMIN', plantelId: plantel.id },
      },
    }),
  ]);

  return { plantelCreado: !existingPlantel, adminCreado: true, carrerasCreadas };
}
