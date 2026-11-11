import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from './prisma.js';

// RN-15: instants are stored in UTC. The Prisma pg adapter sends timestamps without a time zone, so PostgreSQL
// interprets them in the session time zone; the client forces the session to UTC so the stored instant is the real
// one whatever the server's default zone is (a local server in America/Mexico_City shifted them by 6 hours).
describe('prisma client', () => {
  const entidadId = randomUUID();

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { entidadId } });
  });

  it('RN-15: stores the real UTC instant regardless of the server time zone', async () => {
    const instante = new Date('2026-11-11T16:11:59.822Z');
    await prisma.auditLog.create({ data: { accion: 'PRUEBA_ZONA', entidad: 'Prueba', entidadId, fecha: instante } });

    const [fila] = await prisma.$queryRaw<{ utc: string }[]>`
      SELECT to_char(fecha AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS utc
        FROM audit_logs WHERE entidad_id = ${entidadId}`;
    expect(fila?.utc).toBe('2026-11-11T16:11:59.822Z');

    const leido = await prisma.auditLog.findFirstOrThrow({ where: { entidadId } });
    expect(leido.fecha.toISOString()).toBe('2026-11-11T16:11:59.822Z');
  });

  it('uses UTC as the session time zone', async () => {
    const [fila] = await prisma.$queryRaw<{ TimeZone: string }[]>`SHOW timezone`;
    expect(fila?.TimeZone).toBe('UTC');
  });
});
