import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import { guardarResponsableSchema, oficinaParamSchema } from './oficinas.schemas.js';
import { guardarResponsable, listarResponsables } from './oficinas.service.js';

export const oficinasRouter = Router();

oficinasRouter.get('/responsables', requireSession(), requireRol('ADMIN', 'VINCULACION'), async (req, res) => {
  res.json(await listarResponsables(getAuth(req).user));
});

oficinasRouter.put('/responsables/:oficina', requireSession(), requireRol('ADMIN'), async (req, res) => {
  const { oficina } = oficinaParamSchema.parse(req.params);
  res.json(await guardarResponsable(getAuth(req).user, oficina, guardarResponsableSchema.parse(req.body)));
});
