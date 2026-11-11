import { Router } from 'express';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import { escaneoSchema, historialQuerySchema } from './asistencias.schemas.js';
import { registrarEscaneo } from './asistencias.service.js';
import { obtenerHistorial } from './historial.service.js';

export const asistenciasRouter = Router();

// RF-19: one week of attendances. The student sees their own case file; the office passes `expedienteId`.
asistenciasRouter.get('/', requireSession(), requireRol('ALUMNO', 'VINCULACION', 'ADMIN'), async (req, res) => {
  const query = historialQuerySchema.parse(req.query);
  res.json({ semana: await obtenerHistorial(getAuth(req).user, query) });
});

// RF-14, RF-15: the student scans (or types) the institution QR. 201 for a new entry, 200 otherwise.
asistenciasRouter.post('/escaneo', requireSession(), requireRol('ALUMNO'), async (req, res) => {
  const input = escaneoSchema.parse(req.body);
  const { creada, ...respuesta } = await registrarEscaneo(getAuth(req).user, input);
  res.status(creada ? 201 : 200).json(respuesta);
});
