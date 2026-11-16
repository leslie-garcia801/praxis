import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import { darDeBajaSchema, suscribirSchema } from './push.schemas.js';
import { darDeBaja, obtenerClavePublica, suscribir } from './push.service.js';

// Mounted at /api/push.
export const pushRouter = Router();

// RF-28: the public VAPID key the browser needs to subscribe. 503 PUSH_NO_CONFIGURADO when the keys are missing.
pushRouter.get('/clave-publica', requireSession(), (_req, res) => {
  res.json({ clavePublica: obtenerClavePublica() });
});

// RF-28: registers (201) or refreshes (200) the push subscription of this device for the student.
pushRouter.post('/suscripciones', requireSession(), requireRol('ALUMNO'), async (req, res) => {
  const { id, creada } = await suscribir(getAuth(req).user.id, suscribirSchema.parse(req.body));
  res.status(creada ? 201 : 200).json({ suscripcion: { id } });
});

// RF-28: removes the student's own subscription; 204 even when it does not exist.
pushRouter.delete('/suscripciones', requireSession(), requireRol('ALUMNO'), async (req, res) => {
  await darDeBaja(getAuth(req).user.id, darDeBajaSchema.parse(req.body).endpoint);
  res.status(204).end();
});
