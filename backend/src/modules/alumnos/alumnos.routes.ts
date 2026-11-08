import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import { alumnoIdParamsSchema } from './alumnos.schemas.js';
import { restablecerContrasena } from './alumnos.service.js';

export const alumnosRouter = Router();

alumnosRouter.post(
  '/:id/restablecer-contrasena',
  requireSession(),
  requireRol('VINCULACION', 'ADMIN'),
  async (req, res) => {
    const { id } = alumnoIdParamsSchema.parse(req.params);
    const passwordTemporal = await restablecerContrasena(getAuth(req).user, id);
    // Shown once to vinculación; must never be cached.
    res.set('Cache-Control', 'no-store').json({ passwordTemporal });
  },
);
