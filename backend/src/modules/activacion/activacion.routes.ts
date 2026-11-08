import { Router } from 'express';
import { rateLimit } from '../../middleware/rateLimit.js';
import { activarSchema, verificarSchema } from './activacion.schemas.js';
import { activarCuenta, verificarActivacion } from './activacion.service.js';

// Public routes (RF-02). Mounted on /api/auth/activar before Better Auth's catch-all handler.
export const activacionRouter = Router();

// Shared across both routes: limits name guessing per client IP (RNF-06).
activacionRouter.use(rateLimit({ windowMs: 60_000, max: 10 }));

activacionRouter.post('/verificar', async (req, res) => {
  await verificarActivacion(verificarSchema.parse(req.body));
  res.json({ ok: true });
});

activacionRouter.post('/', async (req, res) => {
  await activarCuenta(activarSchema.parse(req.body));
  res.status(201).json({ ok: true });
});
