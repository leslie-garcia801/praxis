import { z } from 'zod';

// Mirrors backend oficinas.schemas.ts (guardarResponsableSchema); the backend is the source of truth.
export const firmaSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre.').max(150, 'El nombre no puede tener más de 150 caracteres.'),
  cargo: z.string().trim().min(1, 'Escribe el cargo.').max(150, 'El cargo no puede tener más de 150 caracteres.'),
});
export type FirmaValues = z.infer<typeof firmaSchema>;
