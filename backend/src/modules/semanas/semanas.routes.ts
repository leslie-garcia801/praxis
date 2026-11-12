import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import { bitacoraSchema, semanaIdParamsSchema } from './semanas.schemas.js';
import { enviarSemana, guardarBitacora, listarPendientes } from './semanas.service.js';

export const semanasRouter = Router();

// RF-18: weeks that need the student's attention. Declared before the `/:id` routes.
semanasRouter.get('/pendientes', requireSession(), requireRol('ALUMNO'), async (req, res) => {
  res.json({ pendientes: await listarPendientes(getAuth(req).user) });
});

// RF-20: only the student writes the logbook of their own weeks.
semanasRouter.put('/:id/bitacora', requireSession(), requireRol('ALUMNO'), async (req, res) => {
  const { id } = semanaIdParamsSchema.parse(req.params);
  res.json({ semana: await guardarBitacora(getAuth(req).user, id, bitacoraSchema.parse(req.body)) });
});

// RF-20, RN-17: sends a closed week to validation.
semanasRouter.post('/:id/enviar', requireSession(), requireRol('ALUMNO'), async (req, res) => {
  const { id } = semanaIdParamsSchema.parse(req.params);
  res.json({ semana: await enviarSemana(getAuth(req).user, id) });
});
