import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import {
  crearSupervisorSchema,
  editarSupervisorSchema,
  institucionIdParamsSchema,
  supervisorIdParamsSchema,
} from './supervisores.schemas.js';
import { crearSupervisor, editarSupervisor, listarSupervisores } from './supervisores.service.js';

// Mounted at /api/instituciones/:id/supervisores. The catalog is shared by both offices (RN-03b),
// so there is no office check.
export const supervisoresDeInstitucionRouter = Router({ mergeParams: true });

supervisoresDeInstitucionRouter.get('/', requireSession(), requireRol('ALUMNO', 'VINCULACION', 'ADMIN'), async (req, res) => {
  const { id } = institucionIdParamsSchema.parse(req.params);
  res.json({ supervisores: await listarSupervisores(getAuth(req).user, id) });
});

supervisoresDeInstitucionRouter.post('/', requireSession(), requireRol('ALUMNO', 'VINCULACION', 'ADMIN'), async (req, res) => {
  const { id } = institucionIdParamsSchema.parse(req.params);
  const supervisor = await crearSupervisor(getAuth(req).user, id, crearSupervisorSchema.parse(req.body));
  res.status(201).json({ supervisor });
});

// Mounted at /api/supervisores.
export const supervisoresRouter = Router();

supervisoresRouter.patch('/:id', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  const { id } = supervisorIdParamsSchema.parse(req.params);
  const supervisor = await editarSupervisor(getAuth(req).user, id, editarSupervisorSchema.parse(req.body));
  res.json({ supervisor });
});
