import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import { listarPanelQuerySchema } from './panel.schemas.js';
import { listarPanelAlumnos } from './panel.service.js';

export const panelRouter = Router();

// RF-23, RF-24: students of the user's office with progress columns, plus the office alerts (RN-03b in the service).
panelRouter.get('/alumnos', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  res.json(await listarPanelAlumnos(getAuth(req).user, listarPanelQuerySchema.parse(req.query)));
});
