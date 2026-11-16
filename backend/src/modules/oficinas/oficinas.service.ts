// RF-27: head of each office (name and position printed on the PDF report signature).
// Not personal data in the RN-03b sense, so any vinculación user reads both offices; only the admin edits.
import { NOMBRE_OFICINA, TIPOS_PROGRAMA, type TipoPrograma } from '../../domain/oficinas.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { GuardarResponsableInput } from './oficinas.schemas.js';

const aRespuesta = (oficina: TipoPrograma, fila: { nombre: string; cargo: string; actualizadoEn: Date } | null) => ({
  oficina,
  nombreOficina: NOMBRE_OFICINA[oficina],
  nombre: fila?.nombre ?? null,
  cargo: fila?.cargo ?? null,
  actualizadoEn: fila?.actualizadoEn.toISOString() ?? null,
});

// Always both offices of the user's plantel, in the order of TIPOS_PROGRAMA.
export async function listarResponsables(user: AuthUser) {
  const filas = await prisma.responsableOficina.findMany({ where: { plantelId: user.plantelId } });
  return TIPOS_PROGRAMA.map((oficina) => aRespuesta(oficina, filas.find((f) => f.oficina === oficina) ?? null));
}

export async function guardarResponsable(admin: AuthUser, oficina: TipoPrograma, { nombre, cargo }: GuardarResponsableInput) {
  const where = { plantelId_oficina: { plantelId: admin.plantelId, oficina } };
  const guardada = await prisma.$transaction(async (tx) => {
    const antes = await tx.responsableOficina.findUnique({ where });
    const fila = await tx.responsableOficina.upsert({
      where,
      create: { plantelId: admin.plantelId, oficina, nombre, cargo },
      update: { nombre, cargo },
    });
    await tx.auditLog.create({
      data: {
        usuarioId: admin.id,
        accion: 'EDITAR_RESPONSABLE_OFICINA',
        entidad: 'ResponsableOficina',
        entidadId: fila.id,
        antes: antes ? { oficina, nombre: antes.nombre, cargo: antes.cargo } : undefined,
        despues: { oficina, nombre, cargo },
      },
    });
    return fila;
  });
  return aRespuesta(oficina, guardada);
}

// Head of the office that owns a case file, or null when not captured yet (the PDF must not fail).
export async function responsableDeOficina(plantelId: string, oficina: TipoPrograma) {
  return prisma.responsableOficina.findUnique({
    where: { plantelId_oficina: { plantelId, oficina } },
    select: { nombre: true, cargo: true },
  });
}
