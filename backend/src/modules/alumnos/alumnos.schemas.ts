import { z } from 'zod';

export const alumnoIdParamsSchema = z.object({
  id: z.uuid('El identificador del alumno no es válido.'),
});
