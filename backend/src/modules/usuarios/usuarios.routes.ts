import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import { crearUsuarioVinculacionSchema, editarUsuarioSchema, usuarioIdParamsSchema } from './usuarios.schemas.js';
import { crearUsuarioVinculacion, editarUsuario, listarUsuarios, restablecerContrasenaUsuario } from './usuarios.service.js';

export const usuariosRouter = Router();

usuariosRouter.get('/', requireSession(), requireRol('ADMIN'), async (req, res) => {
  res.json({ usuarios: await listarUsuarios(getAuth(req).user) });
});

usuariosRouter.post('/', requireSession(), requireRol('ADMIN'), async (req, res) => {
  const resultado = await crearUsuarioVinculacion(getAuth(req).user, crearUsuarioVinculacionSchema.parse(req.body));
  // The temporary password is shown once; must never be cached.
  res.status(201).set('Cache-Control', 'no-store').json(resultado);
});

usuariosRouter.patch('/:id', requireSession(), requireRol('ADMIN'), async (req, res) => {
  const { id } = usuarioIdParamsSchema.parse(req.params);
  const usuario = await editarUsuario(getAuth(req).user, id, editarUsuarioSchema.parse(req.body));
  res.json({ usuario });
});

usuariosRouter.post('/:id/restablecer-contrasena', requireSession(), requireRol('ADMIN'), async (req, res) => {
  const { id } = usuarioIdParamsSchema.parse(req.params);
  const passwordTemporal = await restablecerContrasenaUsuario(getAuth(req).user, id);
  // Shown once to the admin; must never be cached.
  res.set('Cache-Control', 'no-store').json({ passwordTemporal });
});
