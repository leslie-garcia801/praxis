import express, { Router, type Request } from 'express';
import { AppError } from '../../lib/errors.js';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import { confirmarAlumnos, plantillaAlumnos, previsualizarAlumnos } from './alumnos.service.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Raw upload (no multer): the file is the request body. The format is detected by content.
const archivo = express.raw({
  type: [XLSX_MIME, 'text/csv', 'application/vnd.ms-excel', 'application/octet-stream'],
  limit: '2mb',
});

function cuerpoArchivo(req: Request): Buffer {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError(400, 'ARCHIVO_INVALIDO', 'Sube un archivo .xlsx o .csv.');
  }
  return req.body;
}

export const importacionesRouter = Router();

importacionesRouter.use(requireSession(), requireRol('VINCULACION', 'ADMIN'));

importacionesRouter.get('/alumnos/plantilla', (_req, res) => {
  res
    .status(200)
    .set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': 'attachment; filename="plantilla-alumnos.xlsx"',
    })
    .send(plantillaAlumnos());
});

importacionesRouter.post('/alumnos/preview', archivo, async (req, res) => {
  res.json(await previsualizarAlumnos(getAuth(req).user, cuerpoArchivo(req)));
});

importacionesRouter.post('/alumnos/confirmar', archivo, async (req, res) => {
  res.status(201).json(await confirmarAlumnos(getAuth(req).user, cuerpoArchivo(req)));
});
