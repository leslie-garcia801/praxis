import { Router } from 'express';
import { getAuth, requireSession } from '../../middleware/auth.js';
import { obtenerPerfil } from './me.service.js';

export const meRouter = Router();

// Allowed with a pending password change: the app reads `debeCambiar` here to ask for a new one (RF-04).
meRouter.get('/', requireSession({ permitirCambioPendiente: true }), async (req, res) => {
  res.json(await obtenerPerfil(getAuth(req).user.id));
});
