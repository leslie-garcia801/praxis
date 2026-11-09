import { describe, expect, it } from 'vitest';
import { ENCABEZADOS_ALUMNOS, extraerFilas, indexarCarreras, MAX_FILAS, validarFilas } from './alumnos.parser.js';

const carreras = indexarCarreras([
  { id: 'c-prog', nombre: 'Programación' },
  { id: 'c-log', nombre: 'Logística' },
]);

const fila = (o: Partial<Record<string, string>> = {}) => [
  o.matricula ?? '12345678901234',
  o.nombre ?? 'Ana María',
  o.paterno ?? 'López',
  o.materno ?? 'García',
  o.carrera ?? 'Programación',
  o.semestre ?? '5',
  o.grupo ?? 'a',
  o.turno ?? 'Matutino',
  o.tipo ?? 'Servicio social',
];

const validar = (...filas: string[][]) => validarFilas(extraerFilas([ENCABEZADOS_ALUMNOS, ...filas]), carreras);

describe('RF-01: headers', () => {
  it('RF-01: matches headers ignoring case, accents and extra spaces', () => {
    const tabla = [
      ['  NUMERO  DE CONTROL', 'nombre', 'apellido PATERNO', 'Apellido Materno', 'carrera', 'SEMESTRE', 'grupo', 'turno', 'tipo'],
      fila(),
    ];
    expect(extraerFilas(tabla)).toHaveLength(1);
  });

  it('RF-01: lists every missing required header in COLUMNAS_FALTANTES', () => {
    const tabla = [['Número de control', 'Nombre'], ['1', 'x']];
    try {
      extraerFilas(tabla);
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ status: 400, code: 'COLUMNAS_FALTANTES' });
      const { columnas } = (err as { details: { columnas: string[] } }).details;
      expect(columnas).toContain('Carrera');
      expect(columnas).not.toContain('Nombre');
    }
  });

  it('RNF-07: drops extra columns such as CURP so they are never read', () => {
    const tabla = [[...ENCABEZADOS_ALUMNOS, 'CURP'], [...fila(), 'XEXX010101HNEXXXA4']];
    const [primera] = extraerFilas(tabla);
    expect(Object.values(primera!.valores)).not.toContain('XEXX010101HNEXXXA4');
    expect(Object.keys(primera!.valores)).not.toContain('curp');
  });

  it('RF-01: skips fully empty rows and keeps spreadsheet row numbers', () => {
    const vacia = Array<string>(9).fill('');
    const filas = extraerFilas([ENCABEZADOS_ALUMNOS, fila(), vacia, fila({ matricula: '22345678901234' })]);
    expect(filas.map((f) => f.fila)).toEqual([2, 4]);
  });

  it('RF-01: rejects more than 2000 data rows with ARCHIVO_DEMASIADO_GRANDE', () => {
    const muchas = Array.from({ length: MAX_FILAS + 1 }, () => fila());
    expect(() => extraerFilas([ENCABEZADOS_ALUMNOS, ...muchas])).toThrowError(
      expect.objectContaining({ code: 'ARCHIVO_DEMASIADO_GRANDE' }),
    );
  });

  it('RF-01: rejects a file with no student rows with ARCHIVO_INVALIDO', () => {
    expect(() => extraerFilas([ENCABEZADOS_ALUMNOS])).toThrowError(expect.objectContaining({ code: 'ARCHIVO_INVALIDO' }));
  });
});

describe('RF-01: row validation', () => {
  it('RF-01: normalizes a valid row', () => {
    const [r] = validar(fila({ carrera: 'LOGISTICA', turno: 'vespertino', tipo: 'Prácticas' }));
    expect(r!.errores).toEqual([]);
    expect(r!.datos).toEqual({
      matricula: '12345678901234',
      nombre: 'Ana María',
      apellidoPaterno: 'López',
      apellidoMaterno: 'García',
      carreraId: 'c-log',
      semestre: 5,
      grupo: 'A',
      turno: 'VESPERTINO',
      tipo: 'PRACTICAS',
    });
  });

  it('RF-01: accepts "practicas profesionales" and an empty apellido materno', () => {
    const [r] = validar(fila({ tipo: 'practicas profesionales', materno: '' }));
    expect(r!.datos).toMatchObject({ tipo: 'PRACTICAS', apellidoMaterno: null });
  });

  it('RF-01: requires exactly 14 digits in the control number', () => {
    for (const matricula of ['1234567890123', '123456789012345', '1234567890123A', '1.23457E+13', '']) {
      const [r] = validar(fila({ matricula }));
      expect(r!.errores[0]).toMatchObject({ campo: 'matricula' });
    }
  });

  it('RN-01: rejects students below 5th semester', () => {
    const [r] = validar(fila({ semestre: '4' }));
    expect(r!.errores).toEqual([{ campo: 'semestre', mensaje: expect.stringContaining('RN-01') }]);
  });

  it('RN-01: rejects non-integer and above-12 semesters, accepts 5 and 12', () => {
    expect(validar(fila({ semestre: '5.5' }))[0]!.errores[0]!.campo).toBe('semestre');
    expect(validar(fila({ semestre: '13' }))[0]!.errores[0]!.campo).toBe('semestre');
    expect(validar(fila({ semestre: '12' }))[0]!.errores).toEqual([]);
  });

  it('RF-01: reports an unknown career', () => {
    const [r] = validar(fila({ carrera: 'Astrología' }));
    expect(r!.errores).toEqual([{ campo: 'carrera', mensaje: 'Carrera desconocida: "Astrología".' }]);
  });

  it('RF-01: rejects invalid turno and tipo and missing required names', () => {
    const [r] = validar(fila({ turno: 'Nocturno', tipo: 'Otro', nombre: '', paterno: '' }));
    expect(r!.errores.map((e) => e.campo).sort()).toEqual(['apellidoPaterno', 'nombre', 'tipo', 'turno']);
  });

  it('RF-01: flags a control number repeated in the file on every repeated row', () => {
    const rs = validar(fila(), fila({ matricula: '22345678901234' }), fila({ nombre: 'Otra' }));
    expect(rs[0]!.errores[0]).toMatchObject({ campo: 'matricula', mensaje: expect.stringContaining('filas 2, 4') });
    expect(rs[1]!.errores).toEqual([]);
    expect(rs[2]!.errores[0]).toMatchObject({ campo: 'matricula' });
    expect(rs[0]!.datos).toBeNull();
  });
});
