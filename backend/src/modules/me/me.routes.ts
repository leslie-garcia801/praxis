import { Router } from 'express';
import { getAuth, requireSession } from '../../middleware/auth.js';
import { cambiarContrasena } from './cambiarContrasena.service.js';
import { cambiarContrasenaSchema } from './me.schemas.js';
import { obtenerPerfil } from './me.service.js';

export const meRouter = Router();

// Both routes allow a pending password change: the app reads `debeCambiar` from GET /api/me
// and then asks for a new password (RF-04).
const sesionConCambioPendiente = requireSession({ permitirCambioPendiente: true });

meRouter.get('/', sesionConCambioPendiente, async (req, res) => {
  res.json(await obtenerPerfil(getAuth(req).user.id));
});

meRouter.post('/cambiar-contrasena', sesionConCambioPendiente, async (req, res) => {
  await cambiarContrasena(getAuth(req), cambiarContrasenaSchema.parse(req.body));
  res.json({ ok: true });
});
