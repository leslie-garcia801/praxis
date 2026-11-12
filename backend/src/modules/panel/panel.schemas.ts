import { z } from 'zod';

const ESTADOS = ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO', 'FINALIZADO', 'CANCELADO', 'TODOS'] as const;

// RF-23: every filter is optional; an empty value means "no filter". Unknown or malformed values are a 400.
const opcional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const listarPanelQuerySchema = z.object({
  carreraId: opcional(z.uuid('Carrera no válida.')),
  semestre: opcional(z.coerce.number('Semestre no válido.').int('Semestre no válido.').min(1, 'Semestre no válido.').max(12, 'Semestre no válido.')),
  grupo: opcional(z.string().trim().min(1, 'Grupo no válido.').max(20, 'Grupo no válido.')),
  turno: opcional(z.enum(['MATUTINO', 'VESPERTINO'], 'Turno no válido.')),
  // Default (no `estado`): EN_PROCESO and SUSPENDIDO. TODOS includes every state.
  estado: opcional(z.enum(ESTADOS, 'Estado no válido.')),
  institucionId: opcional(z.uuid('Institución no válida.')),
  tipo: opcional(z.enum(['SERVICIO_SOCIAL', 'PRACTICAS'], 'Tipo de programa no válido.')),
  riesgo: opcional(z.enum(['EN_RIESGO'], 'Riesgo no válido.')),
});

export type ListarPanelQuery = z.output<typeof listarPanelQuerySchema>;
