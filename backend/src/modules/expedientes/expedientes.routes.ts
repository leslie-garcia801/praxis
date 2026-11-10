import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import { editarExpedienteSchema, expedienteIdParamsSchema, listarExpedientesQuerySchema } from './expedientes.schemas.js';
import { confirmarExpediente, editarExpediente, listarExpedientes, obtenerExpediente } from './expedientes.service.js';

export const expedientesRouter = Router();

// Ownership (student) and office scope (RN-03b) depend on the case file, so the service checks them.

// What each office has to review. Students use GET /api/me for their own case file.
expedientesRouter.get('/', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  const expedientes = await listarExpedientes(getAuth(req).user, listarExpedientesQuerySchema.parse(req.query));
  res.json({ expedientes });
});

expedientesRouter.get('/:id', requireSession(), requireRol('ALUMNO', 'VINCULACION', 'ADMIN'), async (req, res) => {
  const { id } = expedienteIdParamsSchema.parse(req.params);
  res.json({ expediente: await obtenerExpediente(getAuth(req).user, id) });
});

expedientesRouter.patch('/:id', requireSession(), requireRol('ALUMNO', 'VINCULACION', 'ADMIN'), async (req, res) => {
  const { id } = expedienteIdParamsSchema.parse(req.params);
  const expediente = await editarExpediente(getAuth(req).user, id, editarExpedienteSchema.parse(req.body));
  res.json({ expediente });
});

expedientesRouter.post('/:id/confirmar', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  const { id } = expedienteIdParamsSchema.parse(req.params);
  res.json({ expediente: await confirmarExpediente(getAuth(req).user, id) });
});
