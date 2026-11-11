import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import {
  asignarProgramaSchema,
  cambiarEstadoSchema,
  editarExpedienteSchema,
  expedienteIdParamsSchema,
  listarExpedientesQuerySchema,
  transferirExpedienteSchema,
} from './expedientes.schemas.js';
import {
  asignarPrograma,
  cambiarEstado,
  confirmarExpediente,
  editarExpediente,
  listarExpedientes,
  obtenerExpediente,
  transferirExpediente,
} from './expedientes.service.js';

export const expedientesRouter = Router();

// Ownership (student) and office scope (RN-03b) depend on the case file, so the service checks them.

// What each office has to review. Students use GET /api/me for their own case file.
expedientesRouter.get('/', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  const expedientes = await listarExpedientes(getAuth(req).user, listarExpedientesQuerySchema.parse(req.query));
  res.json({ expedientes });
});

// RF-01, RN-03a: next program for students who finished the first one.
expedientesRouter.post('/asignar', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  const { alumnoIds } = asignarProgramaSchema.parse(req.body);
  res.json(await asignarPrograma(getAuth(req).user, alumnoIds));
});

expedientesRouter.get('/:id',requireSession(), requireRol('ALUMNO', 'VINCULACION', 'ADMIN'), async (req, res) => {
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

// RF-11, RF-12: suspend, reactivate or cancel (baja); the reason is mandatory and audited.
expedientesRouter.patch('/:id/estado', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  const { id } = expedienteIdParamsSchema.parse(req.params);
  res.json({ expediente: await cambiarEstado(getAuth(req).user, id, cambiarEstadoSchema.parse(req.body)) });
});

// RN-12: move to another institution, keeping the validated hours or not.
expedientesRouter.post('/:id/transferir', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  const { id } = expedienteIdParamsSchema.parse(req.params);
  res.status(201).json(await transferirExpediente(getAuth(req).user, id, transferirExpedienteSchema.parse(req.body)));
});
