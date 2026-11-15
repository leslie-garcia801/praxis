import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import { asistenciaIdParamsSchema, solicitarCorreccionSchema } from './correcciones.schemas.js';
import { solicitarCorreccion } from './correcciones.service.js';

// Mounted at /api/asistencias/:id/correcciones.
export const correccionesDeAsistenciaRouter = Router({ mergeParams: true });

// RF-17: the student proposes the correct times of one of their shifts.
correccionesDeAsistenciaRouter.post('/', requireSession(), requireRol('ALUMNO'), async (req, res) => {
  const { id } = asistenciaIdParamsSchema.parse(req.params);
  const correccion = await solicitarCorreccion(getAuth(req).user, id, solicitarCorreccionSchema.parse(req.body));
  res.status(201).json({ correccion });
});
