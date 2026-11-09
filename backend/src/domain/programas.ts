// RN-02: goal hours per program type. Pure logic: no Express or Prisma.
import type { TipoPrograma } from './oficinas.js';

export const META_HORAS: Readonly<Record<TipoPrograma, number>> = {
  SERVICIO_SOCIAL: 480,
  PRACTICAS: 240,
};

export function metaMinutos(tipo: TipoPrograma): number {
  return META_HORAS[tipo] * 60;
}
