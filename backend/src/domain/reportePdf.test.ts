import { describe, expect, it } from 'vitest';
import { construirReporte, formatearHorasMinutos, type DatosReporte } from './reportePdf.js';

const base: DatosReporte = {
  plantel: 'CBTIS 258',
  tipo: 'SERVICIO_SOCIAL',
  desde: null,
  hasta: null,
  alumno: { nombreCompleto: 'Ana María López García', matricula: '25319053990001', carrera: 'Programación', semestre: 5, grupo: 'A' },
  institucion: 'Hospital Muñoz',
  departamento: 'Archivo',
  supervisor: { titulo: 'Lic.', nombreCompleto: 'Laura Mendoza', puesto: 'Jefa de área' },
  turnos: [],
  semanas: [],
  minutosValidadosAcumulados: 0,
  metaMinutos: 480 * 60,
};

const semana = (id: string, semanaInicio: string, estado = 'VALIDADA', actividades: string | null = `Actividades ${id}`) => ({
  id,
  semanaInicio,
  estado,
  actividades,
});
const turno = (entrada: string, minutos: number, semanaId: string | null) => ({
  entrada: new Date(entrada),
  salida: new Date(new Date(entrada).getTime() + minutos * 60_000),
  minutosAcreditables: minutos,
  semanaId,
});
// The whole definition as text, to look for content without parsing PDF bytes.
const texto = (datos: DatosReporte) => JSON.stringify(construirReporte(datos).content);

describe('construirReporte (RF-27)', () => {
  it('uses letter size and shows the header data', () => {
    const doc = construirReporte(base);
    const t = texto(base);
    expect(doc.pageSize).toBe('LETTER');
    expect(t).toContain('CBTIS 258');
    expect(t).toContain('Servicio social');
    expect(t).toContain('Todo el expediente');
    expect(t).toContain('25319053990001');
    expect(t).toContain('Hospital Muñoz');
  });

  it('RN-15: a shift near midnight UTC shows the Monterrey local date and time', () => {
    // 05:30 UTC is 23:30 of the previous day in Monterrey (UTC-6).
    const datos = { ...base, semanas: [semana('s1', '2026-03-02')], turnos: [turno('2026-03-03T05:30:00Z', 90, 's1')] };
    const t = texto(datos);
    expect(t).toContain('02/03/2026');
    expect(t).toContain('23:30');
    expect(t).toContain('01:00');
    expect(t).not.toContain('"03/03/2026"');
  });

  it('includes only shifts and logbooks of VALIDADA weeks', () => {
    const datos = {
      ...base,
      semanas: [semana('v', '2026-03-02'), semana('e', '2026-03-09', 'ENVIADA', 'Actividades de semana enviada')],
      turnos: [turno('2026-03-03T16:00:00Z', 60, 'v'), turno('2026-03-10T16:00:00Z', 120, 'e'), turno('2026-03-04T16:00:00Z', 30, null)],
    };
    const t = texto(datos);
    expect(t).toContain('Actividades v');
    expect(t).not.toContain('Actividades de semana enviada');
    expect(t).toContain('"1:00"');
    expect(t).not.toContain('"2:00"');
    expect(t).not.toContain('"0:30"');
  });

  it('filters by the local date range', () => {
    const datos = {
      ...base,
      desde: '2026-03-04',
      hasta: '2026-03-05',
      semanas: [semana('a', '2026-03-02'), semana('b', '2026-03-16')],
      turnos: [turno('2026-03-03T16:00:00Z', 60, 'a'), turno('2026-03-04T16:00:00Z', 120, 'a'), turno('2026-03-17T16:00:00Z', 30, 'b')],
    };
    const t = texto(datos);
    expect(t).toContain('Del 04/03/2026 al 05/03/2026');
    expect(t).toContain('"2:00"');
    expect(t).not.toContain('"1:00"');
    expect(t).toContain('Actividades a');
    expect(t).not.toContain('Actividades b');
  });

  it('an empty range still produces a document with zero credited hours', () => {
    const datos = {
      ...base,
      desde: '2026-05-01',
      hasta: '2026-05-02',
      semanas: [semana('a', '2026-03-02')],
      turnos: [turno('2026-03-03T16:00:00Z', 60, 'a')],
    };
    const t = texto(datos);
    expect(t).toContain('No hay turnos validados en el periodo.');
    expect(t).toContain('"0:00"');
  });

  it('shows accumulated validated hours against the goal', () => {
    expect(texto({ ...base, minutosValidadosAcumulados: 150 })).toContain('2:30 de 480:00');
  });

  it('signature blocks: supervisor name and an unnamed "Oficina de Vinculación" line', () => {
    const t = texto(base);
    expect(t).toContain('Lic. Laura Mendoza');
    expect(t).toContain('Jefa de área');
    expect(t).toContain('Oficina de Vinculación');
  });

  it('formats minutes as h:mm', () => {
    expect(formatearHorasMinutos(390)).toBe('6:30');
    expect(formatearHorasMinutos(5)).toBe('0:05');
  });
});
