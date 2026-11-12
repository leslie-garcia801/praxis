import { Router, type Response } from 'express';
import { fechaLocal } from '../../lib/tiempo.js';
import { getAuth, requireRol, requireSession } from '../../middleware/auth.js';
import { exportarAlumnosXlsx, exportarEdumediaXlsx } from './exportaciones.service.js';
import { listarPanelQuerySchema } from './panel.schemas.js';
import { listarPanelAlumnos } from './panel.service.js';

export const panelRouter = Router();

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// The file name carries today's date in the app time zone (RN-15).
function enviarXlsx(res: Response, prefijo: string, archivo: Buffer) {
  res
    .status(200)
    .set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${prefijo}-${fechaLocal(new Date())}.xlsx"`,
      'Cache-Control': 'no-store',
    })
    .send(archivo);
}

// RF-23, RF-24: students of the user's office with progress columns, plus the office alerts (RN-03b in the service).
panelRouter.get('/alumnos', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  res.json(await listarPanelAlumnos(getAuth(req).user, listarPanelQuerySchema.parse(req.query)));
});

// RF-26: the filtered table as Excel (same filters and validation as the table).
panelRouter.get('/alumnos.xlsx', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  enviarXlsx(res, 'alumnos', await exportarAlumnosXlsx(getAuth(req).user, listarPanelQuerySchema.parse(req.query)));
});

// RF-26: the data Edumedia asks for, with the same filters.
panelRouter.get('/edumedia.xlsx', requireSession(), requireRol('VINCULACION', 'ADMIN'), async (req, res) => {
  enviarXlsx(res, 'edumedia', await exportarEdumediaXlsx(getAuth(req).user, listarPanelQuerySchema.parse(req.query)));
});
