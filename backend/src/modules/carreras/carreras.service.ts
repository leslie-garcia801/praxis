import { prisma } from '../../lib/prisma.js';

export async function listarCarreras() {
  const carreras = await prisma.carrera.findMany({ select: { id: true, nombre: true } });
  return carreras.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
