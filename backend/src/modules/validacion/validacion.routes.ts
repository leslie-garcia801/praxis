import { Router } from 'express';
import { decisionesSchema, tokenParamsSchema } from './validacion.schemas.js';
import { exigirEnlaceVigente, obtenerEnlace, resolverSemanas } from './validacion.service.js';

// RF-21: PUBLIC routes. The supervisor has no account; the token in the URL is the credential (RNF-06).
// requireTrustedOrigin is not applied: it protects cookie-authenticated requests from CSRF, and these routes read no
// cookie, so a forged cross-site request has nothing to ride on and would need the token anyway.
export const validacionRouter = Router();

// Unknown token 404, expired 410, and only then the body (so a bad link is never reported as a bad body).
validacionRouter.get('/:token', async (req, res) => {
  const { token } = tokenParamsSchema.parse(req.params);
  res.json({ enlace: await obtenerEnlace(await exigirEnlaceVigente(token)) });
});

validacionRouter.post('/:token', async (req, res) => {
  const { token } = tokenParamsSchema.parse(req.params);
  const enlace = await exigirEnlaceVigente(token);
  res.json(await resolverSemanas(enlace, decisionesSchema.parse(req.body)));
});
