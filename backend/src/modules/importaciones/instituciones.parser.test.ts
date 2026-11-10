import { describe, expect, it } from 'vitest';
import { MAX_FILAS } from './alumnos.parser.js';
import {
  ENCABEZADOS_INSTITUCIONES,
  extraerFilas,
  indexarCarreras,
  validarFilas,
} from './instituciones.parser.js';

const carreras = indexarCarreras([
  { id: '11111111-1111-4111-8111-111111111111', nombre: 'Programación' },
  { id: '22222222-2222-4222-8222-222222222222', nombre: 'Logística' },
]);

type Celdas = Partial<Record<(typeof CAMPOS)[number], string>>;
const CAMPOS = [
  'nombre', 'rfc', 'giro', 'calle', 'numExterior', 'numInterior', 'colonia', 'codigoPostal', 'municipio', 'estado',
  'telefono', 'correo', 'representante', 'horario', 'turnos', 'servicio', 'practicas', 'cupo', 'carreras',
] as const;

const fila = (o: Celdas = {}): string[] => {
  const base: Required<Celdas> = {
    nombre: 'Taller Mecánico El Pistón', rfc: '', giro: '', calle: 'Av. Constitución 100', numExterior: '', numInterior: '',
    colonia: '', codigoPostal: '', municipio: 'Monterrey', estado: '', telefono: '', correo: '', representante: '',
    horario: '', turnos: '', servicio: '', practicas: '', cupo: '', carreras: '',
  };
  return CAMPOS.map((c) => o[c] ?? base[c]);
};

const validar = (...filas: string[][]) => validarFilas(extraerFilas([ENCABEZADOS_INSTITUCIONES, ...filas]), carreras);

describe('RF-07: headers', () => {
  it('RF-07: the template has the 19 documented columns in order', () => {
    expect(ENCABEZADOS_INSTITUCIONES).toEqual([
      'Nombre', 'RFC', 'Giro', 'Calle', 'Número exterior', 'Número interior', 'Colonia', 'Código postal', 'Municipio',
      'Estado', 'Teléfono', 'Correo', 'Representante', 'Horario de atención', 'Turnos', 'Acepta servicio',
      'Acepta prácticas', 'Cupo', 'Carreras',
    ]);
  });

  it('RF-07: matches headers ignoring case, accents and extra spaces, and drops extra columns', () => {
    const encabezados = [...ENCABEZADOS_INSTITUCIONES.map((h) => `  ${h.toUpperCase()} `), 'Notas internas'];
    const [f] = extraerFilas([encabezados, [...fila(), 'secreto']]);
    expect(f!.valores.nombre).toBe('Taller Mecánico El Pistón');
    expect(Object.values(f!.valores)).not.toContain('secreto');
  });

  it('RF-07: lists every missing header in COLUMNAS_FALTANTES', () => {
    try {
      extraerFilas([['Nombre', 'RFC'], ['x', 'y']]);
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ status: 400, code: 'COLUMNAS_FALTANTES' });
      const { columnas } = (err as { details: { columnas: string[] } }).details;
      expect(columnas).toContain('Calle');
      expect(columnas).toContain('Carreras');
      expect(columnas).not.toContain('Nombre');
    }
  });

  it('RF-07: rejects a file without rows and one over the row limit', () => {
    expect(() => extraerFilas([ENCABEZADOS_INSTITUCIONES, fila({ nombre: '', calle: '', municipio: '' })])).toThrow(
      expect.objectContaining({ code: 'ARCHIVO_INVALIDO' }),
    );
    const muchas = Array.from({ length: MAX_FILAS + 1 }, (_, i) => fila({ nombre: `Inst ${i}` }));
    expect(() => extraerFilas([ENCABEZADOS_INSTITUCIONES, ...muchas])).toThrow(
      expect.objectContaining({ code: 'ARCHIVO_DEMASIADO_GRANDE' }),
    );
  });

  it('RF-07: skips fully empty rows and keeps the spreadsheet row number', () => {
    const filas = extraerFilas([ENCABEZADOS_INSTITUCIONES, fila({ nombre: '', calle: '', municipio: '' }), fila()]);
    expect(filas.map((f) => f.fila)).toEqual([3]);
  });
});

describe('RF-07: row validation', () => {
  it('RF-07: applies the 0008 defaults to a minimal row', () => {
    const [r] = validar(fila());
    expect(r!.errores).toEqual([]);
    expect(r!.datos).toMatchObject({
      nombre: 'Taller Mecánico El Pistón',
      estado: 'Nuevo León',
      rfc: null,
      correo: null,
      cupo: null,
      turnos: [],
      carreraIds: [],
      aceptaServicio: true,
      aceptaPracticas: true,
      activa: true,
      esPlantel: false,
    });
  });

  it('RF-07: uppercases the RFC and parses lists, booleans and cupo', () => {
    const [r] = validar(
      fila({
        rfc: 'tmp010101ab1', turnos: 'Matutino, vespertino', carreras: 'programación, Logistica', servicio: 'Sí',
        practicas: 'no', cupo: '12', correo: 'Contacto@Piston.MX',
      }),
    );
    expect(r!.errores).toEqual([]);
    expect(r!.datos).toMatchObject({
      rfc: 'TMP010101AB1',
      turnos: ['MATUTINO', 'VESPERTINO'],
      carreraIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
      aceptaServicio: true,
      aceptaPracticas: false,
      cupo: 12,
    });
  });

  it('RF-07: requires nombre, calle and municipio', () => {
    const [r] = validar(fila({ nombre: '', calle: '', municipio: '', giro: 'x' }));
    expect(r!.datos).toBeNull();
    expect(r!.errores.map((e) => e.campo).sort()).toEqual(['calle', 'municipio', 'nombre']);
  });

  it('RF-07: reports unknown carrera, unknown turno, bad boolean, bad cupo and bad correo', () => {
    const [r] = validar(
      fila({ carreras: 'Programación, Alquimia', turnos: 'Nocturno', servicio: 'quizá', cupo: '-3', correo: 'nada' }),
    );
    expect(r!.datos).toBeNull();
    const porCampo = Object.fromEntries(r!.errores.map((e) => [e.campo, e.mensaje]));
    expect(Object.keys(porCampo).sort()).toEqual(['aceptaServicio', 'carreras', 'correo', 'cupo', 'turnos']);
    expect(porCampo.carreras).toContain('Alquimia');
    expect(porCampo.turnos).toContain('Nocturno');
  });

  it('RF-07: rejects a non-integer cupo', () => {
    expect(validar(fila({ cupo: '2.5' }))[0]!.errores[0]).toMatchObject({ campo: 'cupo' });
  });

  it('RF-07: flags a later row repeating an RFC or a normalized name from the file', () => {
    const r = validar(
      fila({ nombre: 'Alfa', rfc: 'AAA010101AA1' }),
      fila({ nombre: 'Beta', rfc: 'aaa010101aa1' }),
      fila({ nombre: '  ALFA  ' }),
      fila({ nombre: 'Álfa' }),
      fila({ nombre: 'Gamma' }),
    );
    expect(r[0]!.errores).toEqual([]);
    expect(r[1]!.errores[0]).toMatchObject({ campo: 'rfc' });
    expect(r[1]!.errores[0]!.mensaje).toContain('fila 2');
    expect(r[2]!.errores[0]).toMatchObject({ campo: 'nombre' });
    expect(r[3]!.errores[0]).toMatchObject({ campo: 'nombre' });
    expect(r[1]!.datos).toBeNull();
    expect(r[4]!.errores).toEqual([]);
  });
});
