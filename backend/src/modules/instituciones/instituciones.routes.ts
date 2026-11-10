import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import {
  crearInstitucionSchema,
  editarInstitucionSchema,
  institucionIdParamsSchema,
  listarInstitucionesQuerySchema,
} from './instituciones.schemas.js';
import { crearInstitucion, editarInstitucion, listarInstituciones, obtenerInstitucion, regenerarQrInstitucion } from './instituciones.service.js';

export const institucionesRouter = Router();

// Read: students, vinculación and admin (specs §4). Write: vinculación and admin.
// The catalog is shared by both offices (RN-03b), so there is no office check.
institucionesRouter.get('/', requireSession(), requireRol('ALUMNO', 'VINCULACION', 'ADMIN'), async (req, res) => {
  const instituciones = await listarInstituciones(getAuth(req).user, listarInstitucionesQuerySchema.parse(req.query));
  res.json({ instituciones });
});

institucionesRouter.get('/:id', requireSession(), requireRol('ALUMNO', 'VINCULACION', 'ADMIN'), async (req, res) => {
  const { id } = institucionIdParamsSchema.parse(req.params);
  res.json({ institucion: await obtenerInstitucion(getAuth(req).user, id) });
});

institucionesRouter.post('/', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  const institucion = await crearInstitucion(getAuth(req).user, crearInstitucionSchema.parse(req.body));
  res.status(201).json({ institucion });
});

institucionesRouter.patch('/:id', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  const { id } = institucionIdParamsSchema.parse(req.params);
  const institucion = await editarInstitucion(getAuth(req).user, id, editarInstitucionSchema.parse(req.body));
  res.json({ institucion });
});

// RF-13: each call issues a new token and short code; the sheet is delivered as a PDF download.
institucionesRouter.post('/:id/qr', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  const { id } = institucionIdParamsSchema.parse(req.params);
  const { pdf, archivo } = await regenerarQrInstitucion(getAuth(req).user, id);
  res
    .status(200)
    .set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${archivo}"`, 'Cache-Control': 'no-store' })
    .send(pdf);
});
