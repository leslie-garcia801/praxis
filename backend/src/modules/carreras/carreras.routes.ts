import { Router } from 'express';
import { requireRol, requireSession } from '../../middleware/auth.js';
import { listarCarreras } from './carreras.service.js';

export const carrerasRouter = Router();

// Catalog used by the vinculación screens (institution filter and form).
carrerasRouter.get('/', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (_req, res) => {
  res.json({ carreras: await listarCarreras() });
});
