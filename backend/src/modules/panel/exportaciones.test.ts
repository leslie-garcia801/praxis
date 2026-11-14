import { randomUUID } from 'node:crypto';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  borrarPlantel,
  crearAlumnoPrecargado,
  crearAsistencia,
  crearExpediente,
  crearInstitucion,
  crearPlantel,
  crearSupervisor,
  crearUsuario,
  iniciarSesion,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { limiteExpediente } from '../../domain/riesgo.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { leerTabla } from '../importaciones/archivo.js';
import { exportarAlumnosXlsx, exportarEdumediaXlsx } from './exportaciones.service.js';
import { listarPanelAlumnos } from './panel.service.js';

const ORIGIN = process.env.FRONTEND_ORIGIN!;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Local time 12:00 (America/Monterrey, UTC-6 in May) on Wednesday 2026-05-20.
const AHORA = new Date('2026-05-20T18:00:00.000Z');
const ahora = () => AHORA;
const HOY = '2026-05-20';
const dia = (fecha: string, hora = '15:00') => new Date(`${fecha}T${hora}:00.000Z`);
const fechaDB = (f: string) => new Date(`${f}T00:00:00.000Z`);
const hace = (dias: number) => {
  const d = new Date(`${HOY}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
};

const aAuthUser = (u: Awaited<ReturnType<typeof crearUsuario>>): AuthUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  username: u.username,
  plantelId: u.plantelId,
  rol: u.rol,
  oficina: u.oficina,
  debeCambiar: u.debeCambiar,
  activo: u.activo,
});

const ENCABEZADOS_ALUMNOS = [
  'Número de control',
  'Alumno',
  'Carrera',
  'Semestre',
  'Grupo',
  'Turno',
  'Programa',
  'Estado',
  'Institución',
  'Horas validadas',
  'Meta (h)',
  'Porcentaje',
  'Horas registradas sin validar',
  'Último registro',
  'Semanas pendientes',
  'Fecha estimada',
  'Riesgo',
  'Límite',
];

const ENCABEZADOS_EDUMEDIA = [
  'Número de control',
  'Nombre(s)',
  'Apellido paterno',
  'Apellido materno',
  'Carrera',
  'Semestre',
  'Grupo',
  'Programa',
  'Institución',
  'RFC de la institución',
  'Departamento o área',
  'Fecha de inicio',
  'Fecha de término',
  'Días pactados',
  'Hora de entrada',
  'Hora de salida',
  'Programa y subprograma',
  'Supervisor',
  'Puesto del supervisor',
  'Correo del supervisor',
  'Teléfono y extensión del supervisor',
];

describe('exportaciones del panel (RF-26)', () => {
  const app = createApp();
  let plantelId: string;
  let otroPlantelId: string;
  let vinculacionServicio: AuthUser;
  let admin: AuthUser;
  let cookieServicio: string;
  let cookiePracticas: string;
  let cookieAlumno: string;
  let institucionId: string;
  let matriculas = 0;

  async function caso(
    opciones: {
      tipo?: 'SERVICIO_SOCIAL' | 'PRACTICAS';
      plantel?: string;
      institucion?: string | null;
      fechaInicio?: string | null;
      datos?: Parameters<typeof crearExpediente>[0]['datos'];
      alumno?: { nombre?: string; apellidoPaterno?: string; apellidoMaterno?: string };
    } = {},
  ) {
    matriculas++;
    const matricula = `${Date.now()}${matriculas}`.padStart(14, '0').slice(-14);
    const alumnoUser = await crearAlumnoPrecargado({ plantelId: opciones.plantel ?? plantelId, matricula, ...opciones.alumno });
    const expediente = await crearExpediente({
      alumnoId: alumnoUser.alumno!.id,
      tipo: opciones.tipo ?? 'SERVICIO_SOCIAL',
      institucionId: opciones.institucion === undefined ? institucionId : opciones.institucion,
      fechaInicio: opciones.fechaInicio === undefined ? fechaDB(hace(60)) : opciones.fechaInicio ? fechaDB(opciones.fechaInicio) : null,
      datos: opciones.datos,
    });
    return { matricula, alumno: alumnoUser.alumno!, expediente };
  }

  // Binary download: the body is collected as a Buffer.
  const descargar = (ruta: string, cookie: string | null, query = '') => {
    const req = request(app)
      .get(`/api/panel/${ruta}${query}`)
      .set('Origin', ORIGIN)
      .buffer(true)
      .parse((res, cb) => {
        const trozos: Buffer[] = [];
        res.on('data', (t: Buffer) => trozos.push(t));
        res.on('end', () => cb(null, Buffer.concat(trozos)));
      });
    return cookie ? req.set('Cookie', cookie) : req;
  };

  // Error responses are JSON; plain request so the body is parsed.
  const pedirError = (ruta: string, cookie: string, query: string) =>
    request(app).get(`/api/panel/${ruta}${query}`).set('Origin', ORIGIN).set('Cookie', cookie);

  const celdasDe = (buffer: Buffer) => {
    const libro = XLSX.read(buffer, { type: 'buffer' });
    return { nombre: libro.SheetNames[0]!, celdas: libro.Sheets[libro.SheetNames[0]!]! };
  };
  const filaDe = (t: string[][], matricula: string) => t.find((f) => f[0] === matricula);

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
    otroPlantelId = (await crearPlantel()).id;
    const uServicio = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' });
    vinculacionServicio = aAuthUser(uServicio);
    const uPracticas = await crearUsuario({ plantelId, rol: 'VINCULACION', oficina: 'PRACTICAS' });
    admin = aAuthUser(await crearUsuario({ plantelId, rol: 'ADMIN' }));
    cookieServicio = await iniciarSesion(app, uServicio);
    cookiePracticas = await iniciarSesion(app, uPracticas);
    cookieAlumno = await iniciarSesion(app, await crearUsuario({ plantelId, rol: 'ALUMNO', username: `al${randomUUID().slice(0, 8)}` }));
    institucionId = (await crearInstitucion({ plantelId, nombre: 'Empresa Uno', datos: { rfc: 'EUN010101AAA' } })).id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await borrarPlantel(otroPlantelId);
    await prisma.$disconnect();
  });

  describe('GET /api/panel/alumnos.xlsx', () => {
    it('writes the table with the expected headers, values and cell types', async () => {
      const { matricula, expediente } = await caso({
        alumno: { nombre: 'Rosa', apellidoPaterno: 'Zúñiga', apellidoMaterno: 'Peña' },
        datos: { minutosTransferidos: 90 },
      });
      await crearAsistencia({ expedienteId: expediente.id, entrada: dia(hace(1)), minutos: 150 });

      const buffer = await exportarAlumnosXlsx(vinculacionServicio, {}, ahora);
      const { nombre, celdas } = celdasDe(buffer);
      expect(nombre).toBe('Alumnos');
      const t = leerTabla(buffer);
      expect(t[0]).toEqual(ENCABEZADOS_ALUMNOS);

      const fila = filaDe(t, matricula)!;
      expect(fila[1]).toBe('Rosa Zúñiga Peña');
      expect(fila[3]).toBe('5');
      expect(fila[6]).toBe('Servicio social');
      expect(fila[7]).toBe('En proceso');
      expect(fila[8]).toBe('Empresa Uno');
      expect(fila[9]).toBe('1.5'); // 90 transferred minutes count as validated
      expect(fila[10]).toBe('480');
      expect(fila[12]).toBe('2.5'); // 150 registered minutes, not validated
      expect(fila[13]).toBe('2026-05-19 09:00'); // 15:00Z is 09:00 in Monterrey
      expect(fila[17]).toBe(limiteExpediente({ tipo: 'SERVICIO_SOCIAL', fechaInicio: hace(60), fechaTermino: null }));

      // Hours are numeric cells; the control number is text.
      const r = t.findIndex((f) => f[0] === matricula) + 1;
      expect(celdas[`A${r}`]).toMatchObject({ t: 's', v: matricula });
      expect(celdas[`J${r}`]).toMatchObject({ t: 'n', v: 1.5 });
      expect(celdas[`K${r}`]).toMatchObject({ t: 'n', v: 480 });
      expect(celdas[`M${r}`]).toMatchObject({ t: 'n', v: 2.5 });
    });

    it('RN-03b: rows and numbers match the panel table and other offices do not appear', async () => {
      const servicio = await caso({ tipo: 'SERVICIO_SOCIAL' });
      const practicas = await caso({ tipo: 'PRACTICAS', datos: { fechaTermino: fechaDB(hace(-30)) } });
      const ajeno = await caso({ plantel: otroPlantelId, institucion: null });
      await crearAsistencia({ expedienteId: servicio.expediente.id, entrada: dia(hace(2)), minutos: 240 });

      const t = leerTabla(await exportarAlumnosXlsx(vinculacionServicio, {}, ahora));
      expect(filaDe(t, servicio.matricula)).toBeDefined();
      expect(filaDe(t, practicas.matricula)).toBeUndefined();
      expect(filaDe(t, ajeno.matricula)).toBeUndefined();

      const panel = (await listarPanelAlumnos(vinculacionServicio, {}, ahora)).alumnos;
      expect(t.slice(1).map((f) => f[0])).toEqual(panel.map((f) => f.alumno.matricula));
      const delPanel = panel.find((f) => f.expediente.id === servicio.expediente.id)!;
      const fila = filaDe(t, servicio.matricula)!;
      expect(Number(fila[12])).toBe(Math.round((delPanel.minutosRegistrados / 60) * 10) / 10);
      expect(fila[11]).toBe(String(delPanel.porcentaje));
      expect(fila[17]).toBe(delPanel.limite);
    });

    it('applies the same filters as the panel table', async () => {
      const a = await caso();
      const b = await caso();
      await prisma.alumno.update({ where: { id: b.alumno.id }, data: { grupo: 'Z' } });

      const t = leerTabla(await exportarAlumnosXlsx(admin, { grupo: 'Z' }, ahora));
      expect(t.slice(1).map((f) => f[0])).toEqual([b.matricula]);
      expect(filaDe(t, a.matricula)).toBeUndefined();
    });

    it('serves the file with attachment headers and a dated filename', async () => {
      const { matricula } = await caso();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-12T18:00:00.000Z'));

      const res = await descargar('alumnos.xlsx', cookieServicio);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain(XLSX_MIME);
      expect(res.headers['content-disposition']).toBe('attachment; filename="alumnos-2026-11-12.xlsx"');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(filaDe(leerTabla(res.body as Buffer), matricula)).toBeDefined();
    });

    it('RNF-07: exports no CURP, edad, sexo or afiliación column', async () => {
      const [encabezados] = leerTabla(await exportarAlumnosXlsx(admin, {}, ahora));
      expect(encabezados!.join('|')).not.toMatch(/curp|edad|sexo|afiliaci/i);
    });

    it('returns 401 without a session', async () => {
      expect((await descargar('alumnos.xlsx', null)).status).toBe(401);
    });

    it('returns 403 for alumno', async () => {
      expect((await descargar('alumnos.xlsx', cookieAlumno)).status).toBe(403);
    });

    it('RN-03b: returns 403 when the tipo filter is outside the office scope', async () => {
      expect((await descargar('alumnos.xlsx', cookieServicio, '?tipo=PRACTICAS')).status).toBe(403);
      expect((await descargar('alumnos.xlsx', cookiePracticas, '?tipo=PRACTICAS')).status).toBe(200);
    });

    it.each(['?estado=NADA', '?semestre=abc', '?carreraId=no-uuid', '?turno=NOCTURNO', '?riesgo=EN_TIEMPO'])(
      'returns 400 for the invalid filter %s',
      async (query) => {
        const res = await pedirError('alumnos.xlsx', cookieServicio, query);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      },
    );
  });

  describe('GET /api/panel/edumedia.xlsx', () => {
    it('writes the Edumedia columns with the supervisor, institution and schedule data', async () => {
      const supervisor = await crearSupervisor({
        institucionId,
        datos: {
          titulo: 'Lic.',
          nombre: 'Laura',
          apellidoPaterno: 'Mendoza',
          apellidoMaterno: 'Ríos',
          puesto: 'Gerente',
          correo: 'laura@empresa.invalid',
          telefono: '8112345678',
          extension: '204',
        },
      });
      const { matricula } = await caso({
        alumno: { nombre: 'Rosa', apellidoPaterno: 'Zúñiga', apellidoMaterno: 'Peña' },
        fechaInicio: '2026-03-31',
        datos: {
          supervisorId: supervisor.id,
          departamento: 'Sistemas',
          diasPactados: [1, 3, 5],
          horaEntrada: '08:00',
          horaSalida: '12:00',
          programa: 'Programa Joven',
          subprograma: 'Educación',
        },
      });

      const buffer = await exportarEdumediaXlsx(vinculacionServicio, {}, ahora);
      const { nombre, celdas } = celdasDe(buffer);
      expect(nombre).toBe('Edumedia');
      const t = leerTabla(buffer);
      expect(t[0]).toEqual(ENCABEZADOS_EDUMEDIA);

      const fila = filaDe(t, matricula)!;
      expect(fila.slice(1, 4)).toEqual(['Rosa', 'Zúñiga', 'Peña']);
      expect(fila[5]).toBe('5');
      expect(fila[6]).toBe('A');
      expect(fila[7]).toBe('Servicio social');
      expect(fila[8]).toBe('Empresa Uno');
      expect(fila[9]).toBe('EUN010101AAA');
      expect(fila[10]).toBe('Sistemas');
      expect(fila[11]).toBe('2026-03-31');
      expect(fila[13]).toBe('Lun, Mié, Vie');
      expect(fila[14]).toBe('08:00');
      expect(fila[15]).toBe('12:00');
      expect(fila[16]).toBe('Programa Joven / Educación');
      expect(fila[17]).toBe('Lic. Laura Mendoza Ríos');
      expect(fila[18]).toBe('Gerente');
      expect(fila[19]).toBe('laura@empresa.invalid');
      expect(fila[20]).toBe('8112345678 ext. 204');

      const r = t.findIndex((f) => f[0] === matricula) + 1;
      expect(celdas[`A${r}`]).toMatchObject({ t: 's', v: matricula });
      expect(celdas[`A${r}`]!.v).toHaveLength(14);
    });

    it('RN-06a: servicio social ends at start + 6 months, computed with the panel limit function', async () => {
      const { matricula } = await caso({ fechaInicio: '2026-08-31' });
      const fila = filaDe(leerTabla(await exportarEdumediaXlsx(vinculacionServicio, {}, ahora)), matricula)!;
      const esperado = limiteExpediente({ tipo: 'SERVICIO_SOCIAL', fechaInicio: '2026-08-31', fechaTermino: null });
      expect(esperado).toBe('2027-02-28');
      expect(fila[12]).toBe(esperado);
    });

    it('uses the case file end date for prácticas and leaves the dates empty without a start date', async () => {
      const conFechas = await caso({ tipo: 'PRACTICAS', fechaInicio: '2026-03-01', datos: { fechaTermino: fechaDB('2026-09-01') } });
      const sinInicio = await caso({ fechaInicio: null });

      const t = leerTabla(await exportarEdumediaXlsx(admin, {}, ahora));
      expect(filaDe(t, conFechas.matricula)![12]).toBe('2026-09-01');
      expect(filaDe(t, conFechas.matricula)![7]).toBe('Prácticas');
      expect(filaDe(t, sinInicio.matricula)![11]).toBe('');
      expect(filaDe(t, sinInicio.matricula)![12]).toBe('');
    });

    it('leaves the institution and supervisor columns empty when the case file has none', async () => {
      const { matricula } = await caso({ institucion: null });
      const fila = filaDe(leerTabla(await exportarEdumediaXlsx(vinculacionServicio, {}, ahora)), matricula)!;
      expect(fila.slice(8, 11)).toEqual(['', '', '']);
      expect(fila.slice(13, 21)).toEqual(['', '', '', '', '', '', '', '']);
    });

    it('RN-03b: only the rows of the office and the applied filters appear', async () => {
      const servicio = await caso();
      const practicas = await caso({ tipo: 'PRACTICAS' });
      const ajeno = await caso({ plantel: otroPlantelId, institucion: null });
      await prisma.alumno.update({ where: { id: servicio.alumno.id }, data: { grupo: 'Y' } });

      const delOficina = leerTabla(await exportarEdumediaXlsx(vinculacionServicio, {}, ahora));
      expect(filaDe(delOficina, servicio.matricula)).toBeDefined();
      for (const otro of [practicas, ajeno]) expect(filaDe(delOficina, otro.matricula)).toBeUndefined();

      const filtrado = leerTabla(await exportarEdumediaXlsx(admin, { grupo: 'Y' }, ahora));
      expect(filtrado.slice(1).map((f) => f[0])).toEqual([servicio.matricula]);
    });

    it('serves the file with attachment headers and a dated filename', async () => {
      const { matricula } = await caso();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-12T18:00:00.000Z'));

      const res = await descargar('edumedia.xlsx', cookieServicio);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain(XLSX_MIME);
      expect(res.headers['content-disposition']).toBe('attachment; filename="edumedia-2026-11-12.xlsx"');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(filaDe(leerTabla(res.body as Buffer), matricula)).toBeDefined();
    });

    it('RNF-07: exports no CURP, edad, sexo or afiliación column', async () => {
      const [encabezados] = leerTabla(await exportarEdumediaXlsx(admin, {}, ahora));
      expect(encabezados!.join('|')).not.toMatch(/curp|edad|sexo|afiliaci/i);
    });

    it('returns 401 without a session', async () => {
      expect((await descargar('edumedia.xlsx', null)).status).toBe(401);
    });

    it('returns 403 for alumno', async () => {
      expect((await descargar('edumedia.xlsx', cookieAlumno)).status).toBe(403);
    });

    it('RN-03b: returns 403 when the tipo filter is outside the office scope', async () => {
      expect((await descargar('edumedia.xlsx', cookieServicio, '?tipo=PRACTICAS')).status).toBe(403);
    });

    it.each(['?estado=NADA', '?semestre=0', '?institucionId=x', '?tipo=OTRO'])('returns 400 for the invalid filter %s', async (query) => {
      const res = await pedirError('edumedia.xlsx', cookieServicio, query);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
