import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import { crearUsuarioVinculacionSchema } from './usuarios.schemas.js';
import { crearUsuarioVinculacion } from './usuarios.service.js';

export const usuariosRouter = Router();

usuariosRouter.post('/', requireSession(), requireRol('ADMIN'), async (req, res) => {
  const resultado = await crearUsuarioVinculacion(getAuth(req).user, crearUsuarioVinculacionSchema.parse(req.body));
  // The temporary password is shown once; must never be cached.
  res.status(201).set('Cache-Control', 'no-store').json(resultado);
});
