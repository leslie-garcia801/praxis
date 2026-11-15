import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import {
  asistenciaIdParamsSchema,
  correccionIdParamsSchema,
  listarCorreccionesQuerySchema,
  resolverCorreccionSchema,
  solicitarCorreccionSchema,
} from './correcciones.schemas.js';
import { listarCorrecciones, resolverCorreccion, solicitarCorreccion } from './correcciones.service.js';

// Mounted at /api/asistencias/:id/correcciones.
export const correccionesDeAsistenciaRouter = Router({ mergeParams: true });

// RF-17: the student proposes the correct times of one of their shifts.
correccionesDeAsistenciaRouter.post('/', requireSession(), requireRol('ALUMNO'), async (req, res) => {
  const { id } = asistenciaIdParamsSchema.parse(req.params);
  const correccion = await solicitarCorreccion(getAuth(req).user, id, solicitarCorreccionSchema.parse(req.body));
  res.status(201).json({ correccion });
});

// Mounted at /api/correcciones.
export const correccionesRouter = Router();

// RF-17: the office's queue (scoped to its office, RN-03b) or the student's own requests.
correccionesRouter.get('/', requireSession(), requireRol('ALUMNO', 'VINCULACION', 'ADMIN'), async (req, res) => {
  const query = listarCorreccionesQuerySchema.parse(req.query);
  res.json({ correcciones: await listarCorrecciones(getAuth(req).user, query) });
});

// RF-17: the office approves or rejects a pending request.
correccionesRouter.patch('/:id', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  const { id } = correccionIdParamsSchema.parse(req.params);
  res.json({ correccion: await resolverCorreccion(getAuth(req).user, id, resolverCorreccionSchema.parse(req.body)) });
});
