import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { borrarPlantel, crearAlumnoPrecargado, crearExpediente, crearPlantel, crearSemana } from '../../../test/factories.js';
import { prisma } from '../../lib/prisma.js';
import { instanteLocal } from '../../lib/tiempo.js';

// Attendances are inserted with SQL and explicit UTC instants (not through the Prisma adapter) so the stored
// instant does not depend on the time zone of the database session; the backfill reads the column with SQL too.
async function crearAsistencia({
  expedienteId,
  entrada,
  minutos,
  semanaId = null,
}: {
  expedienteId: string;
  entrada: Date;
  minutos: number;
  semanaId?: string | null;
}) {
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "asistencias" ("id", "expediente_id", "entrada", "salida", "minutos_acreditables", "estado", "semana_id")
     VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5::int, 'CERRADA', $6)`,
    id,
    expedienteId,
    entrada.toISOString(),
    new Date(entrada.getTime() + minutos * 60_000).toISOString(),
    minutos,
    semanaId,
  );
  return { id };
}

// The data migration of 0020 lives in the migration file itself. The test runs that same SQL (the block between
// the BACKFILL markers) against rows created without a week, as they were before the migration.
const MIGRACION = new URL('../../../prisma/migrations/20261111000000_semanas_bitacora/migration.sql', import.meta.url);

function sqlDeRelleno(): string[] {
  const sql = readFileSync(MIGRACION, 'utf8');
  const bloque = sql.split('-- BACKFILL START')[1]!.split('-- BACKFILL END')[0]!;
  return bloque
    .split('\n')
    .filter((linea) => !linea.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

const rellenar = async () => {
  for (const sentencia of sqlDeRelleno()) await prisma.$executeRawUnsafe(sentencia);
};

const lunes = (d: Date) => d.toISOString().slice(0, 10);

describe('migración de datos de semanas (RF-19, RN-15)', () => {
  let plantelId: string;
  let contador = 0;

  async function expedienteNuevo() {
    contador++;
    const usuario = await crearAlumnoPrecargado({ plantelId, matricula: `2531905666${String(contador).padStart(4, '0')}` });
    return crearExpediente({ alumnoId: usuario.alumno!.id });
  }

  beforeAll(async () => {
    plantelId = (await crearPlantel()).id;
  });

  afterAll(async () => {
    await borrarPlantel(plantelId);
    await prisma.$disconnect();
  });

  it('el bloque de relleno existe y tiene dos sentencias', () => {
    expect(sqlDeRelleno()).toHaveLength(2);
  });

  it('RN-15: crea las semanas que faltan con el lunes local de la entrada y asigna cada asistencia', async () => {
    const e = await expedienteNuevo();
    const martes = await crearAsistencia({ expedienteId: e.id, entrada: instanteLocal('2026-11-10', '09:00'), minutos: 60 });
    const jueves = await crearAsistencia({ expedienteId: e.id, entrada: instanteLocal('2026-11-12', '09:00'), minutos: 60 });
    // Sunday 22:00 in Monterrey is already Monday in UTC: it still belongs to the week that starts on 2026-11-09.
    const domingo = await crearAsistencia({ expedienteId: e.id, entrada: instanteLocal('2026-11-15', '22:00'), minutos: 30 });
    // Monday 00:30 in Monterrey opens the week of 2026-11-16.
    const lunesSiguiente = await crearAsistencia({ expedienteId: e.id, entrada: instanteLocal('2026-11-16', '00:30'), minutos: 30 });
    const abierta = await crearAsistencia({ expedienteId: e.id, entrada: instanteLocal('2026-11-03', '08:00'), minutos: 120 });

    await rellenar();

    const semanas = await prisma.semanaBitacora.findMany({ where: { expedienteId: e.id }, orderBy: { semanaInicio: 'asc' } });
    expect(semanas.map((s) => lunes(s.semanaInicio))).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(semanas.every((s) => s.estado === 'BORRADOR' && s.enviadaEn === null && s.bitacoraActualizadaEn === null)).toBe(true);
    expect(new Set(semanas.map((s) => s.id)).size).toBe(3);

    const idDe = async (id: string) => {
      const a = await prisma.asistencia.findUniqueOrThrow({ where: { id }, include: { semana: true } });
      return lunes(a.semana!.semanaInicio);
    };
    expect(await idDe(abierta.id)).toBe('2026-11-02');
    expect(await idDe(martes.id)).toBe('2026-11-09');
    expect(await idDe(jueves.id)).toBe('2026-11-09');
    expect(await idDe(domingo.id)).toBe('2026-11-09');
    expect(await idDe(lunesSiguiente.id)).toBe('2026-11-16');
  });

  it('reutiliza la semana que ya existe y no toca las asistencias que ya tienen semana', async () => {
    const e = await expedienteNuevo();
    const existente = await crearSemana({ expedienteId: e.id, semanaInicio: '2026-11-09', estado: 'ENVIADA' });
    const otraSemana = await crearSemana({ expedienteId: e.id, semanaInicio: '2026-11-02', estado: 'VALIDADA' });
    const sinSemana = await crearAsistencia({ expedienteId: e.id, entrada: instanteLocal('2026-11-10', '09:00'), minutos: 60 });
    // Already assigned (even to a different week): the migration never reassigns.
    const yaAsignada = await crearAsistencia({
      expedienteId: e.id,
      entrada: instanteLocal('2026-11-11', '09:00'),
      minutos: 60,
      semanaId: otraSemana.id,
    });

    await rellenar();

    expect(await prisma.semanaBitacora.count({ where: { expedienteId: e.id } })).toBe(2);
    expect((await prisma.semanaBitacora.findUniqueOrThrow({ where: { id: existente.id } })).estado).toBe('ENVIADA');
    expect((await prisma.asistencia.findUniqueOrThrow({ where: { id: sinSemana.id } })).semanaId).toBe(existente.id);
    expect((await prisma.asistencia.findUniqueOrThrow({ where: { id: yaAsignada.id } })).semanaId).toBe(otraSemana.id);
  });

  it('separa las semanas por expediente y se puede repetir sin duplicar', async () => {
    const a = await expedienteNuevo();
    const b = await expedienteNuevo();
    await crearAsistencia({ expedienteId: a.id, entrada: instanteLocal('2026-11-10', '09:00'), minutos: 60 });
    await crearAsistencia({ expedienteId: b.id, entrada: instanteLocal('2026-11-10', '09:00'), minutos: 60 });

    await rellenar();
    await rellenar();

    const semanas = await prisma.semanaBitacora.findMany({ where: { expedienteId: { in: [a.id, b.id] } } });
    expect(semanas).toHaveLength(2);
    expect(new Set(semanas.map((s) => s.expedienteId))).toEqual(new Set([a.id, b.id]));
    expect(await prisma.asistencia.count({ where: { expedienteId: { in: [a.id, b.id] }, semanaId: null } })).toBe(0);
  });
});
