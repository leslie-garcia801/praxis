import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { construirXlsx } from './xlsx.js';

const leerHoja = (buffer: Buffer) => {
  const libro = XLSX.read(buffer, { type: 'buffer', cellStyles: true });
  const nombre = libro.SheetNames[0]!;
  return { nombre, hoja: libro.Sheets[nombre]! };
};

describe('construirXlsx', () => {
  it('writes text, numeric and empty cells with the right types', () => {
    const { nombre, hoja } = leerHoja(construirXlsx([['Horas', 'Nombre', 'Vacío'], [12.5, 'Ana', null]], 'Datos'));
    expect(nombre).toBe('Datos');
    expect(hoja['A2']).toMatchObject({ t: 'n', v: 12.5 });
    expect(hoja['B2']).toMatchObject({ t: 's', v: 'Ana' });
    expect(hoja['C2']).toBeUndefined();
  });

  it('keeps a 14-digit control number as text, including leading zeros', () => {
    const { hoja } = leerHoja(construirXlsx([['Control'], ['00012345678901'], [12345678901234]], 'Datos', { columnasTexto: [0] }));
    expect(hoja['A2']).toMatchObject({ t: 's', v: '00012345678901' });
    expect(hoja['A3']).toMatchObject({ t: 's', v: '12345678901234' });
  });

  it('sets the column widths', () => {
    const { hoja } = leerHoja(construirXlsx([['A', 'B']], 'Datos', { anchos: [10, 25] }));
    expect(hoja['!cols']?.map((c) => c.wch)).toEqual([10, 25]);
  });
});
