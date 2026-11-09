import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors.js';
import { leerTabla } from './archivo.js';

function xlsx(aoa: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Hoja1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const texto = (s: string) => Buffer.from(s, 'utf8');

describe('RF-01: leerTabla', () => {
  it('RF-01: reads an .xlsx detected by its ZIP magic bytes', () => {
    expect(leerTabla(xlsx([['a', 'b'], ['1', 'x']]))).toEqual([['a', 'b'], ['1', 'x']]);
  });

  it('RF-01: keeps a 14-digit control number stored as a numeric cell without scientific notation', () => {
    const tabla = leerTabla(xlsx([['m'], [12345678901234]]));
    expect(tabla[1]).toEqual(['12345678901234']);
  });

  it('RF-01: keeps leading zeros of a text cell', () => {
    expect(leerTabla(xlsx([['m'], ['00123456789012']]))[1]).toEqual(['00123456789012']);
  });

  it('RF-01: reads only the first sheet', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['uno']]), 'A');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['dos']]), 'B');
    expect(leerTabla(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))).toEqual([['uno']]);
  });

  it('RF-01: reads a comma-delimited CSV', () => {
    expect(leerTabla(texto('a,b\n1,2\n'))).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('RF-01: reads a semicolon-delimited CSV (Excel in Spanish locale)', () => {
    expect(leerTabla(texto('a;b\r\n1;2\r\n'))).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('RF-01: strips the UTF-8 BOM and keeps accents', () => {
    expect(leerTabla(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), texto('Número,Nombre\n1,José')]))).toEqual([
      ['Número', 'Nombre'],
      ['1', 'José'],
    ]);
  });

  it('RF-01: supports quoted fields with the delimiter inside', () => {
    expect(leerTabla(texto('a;b\n"x;y";"say ""hi"""\n'))).toEqual([['a', 'b'], ['x;y', 'say "hi"']]);
  });

  it('RF-01: rejects an empty file with ARCHIVO_INVALIDO', () => {
    expect(() => leerTabla(Buffer.alloc(0))).toThrowError(expect.objectContaining({ code: 'ARCHIVO_INVALIDO' }));
  });

  it('RF-01: rejects a corrupt ZIP and binary garbage with ARCHIVO_INVALIDO', () => {
    expect(() => leerTabla(Buffer.from('PK\x03\x04garbage'))).toThrowError(AppError);
    expect(() => leerTabla(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x00]))).toThrowError(
      expect.objectContaining({ code: 'ARCHIVO_INVALIDO' }),
    );
  });
});
