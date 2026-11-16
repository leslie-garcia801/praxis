import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearColaEnMemoria } from './almacenamientoMemoria';
import { crearColaIndexedDb, crearColaPendientes } from './almacenamientoIndexedDb';
import type { ColaPendientes, RegistroPendiente } from './tipos';

// Every test starts with an empty IndexedDB.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

function registro(id: string, creadoEn: string, credencial: { token: string } | { codigoCorto: string } = { token: `tok-${id}` }): RegistroPendiente {
  return { id, usuarioId: 'user-1', ...credencial, hora: creadoEn, creadoEn, sinConexion: true, estado: { tipo: 'PENDIENTE' } };
}

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

// The same contract for both adapters of the storage port.
describe.each([
  ['IndexedDB', crearColaIndexedDb],
  ['memoria', crearColaEnMemoria],
] as const)('cola de pendientes en %s', (_nombre, crear: () => ColaPendientes) => {
  it('RF-16: empieza vacía', async () => {
    expect(await crear().listar()).toEqual([]);
  });

  it('RF-16: lista en orden de creación aunque se agreguen desordenados', async () => {
    const cola = crear();
    await cola.agregar(registro(ID_B, '2026-11-16T08:05:00-06:00'));
    await cola.agregar(registro(ID_C, '2026-11-16T08:10:00-06:00'));
    await cola.agregar(registro(ID_A, '2026-11-16T08:00:00-06:00'));

    expect((await cola.listar()).map((r) => r.id)).toEqual([ID_A, ID_B, ID_C]);
  });

  it('RF-16: guarda el registro completo, con token o con código corto', async () => {
    const cola = crear();
    const conToken = registro(ID_A, '2026-11-16T08:00:00-06:00');
    const conCodigo = registro(ID_B, '2026-11-16T08:05:00-06:00', { codigoCorto: 'ABC234' });
    await cola.agregar(conToken);
    await cola.agregar(conCodigo);

    expect(await cola.listar()).toEqual([conToken, conCodigo]);
  });

  it('RF-16: elimina solo el registro indicado', async () => {
    const cola = crear();
    await cola.agregar(registro(ID_A, '2026-11-16T08:00:00-06:00'));
    await cola.agregar(registro(ID_B, '2026-11-16T08:05:00-06:00'));

    await cola.eliminar(ID_A);

    expect((await cola.listar()).map((r) => r.id)).toEqual([ID_B]);
  });

  it('RF-16: eliminar un id inexistente no falla', async () => {
    const cola = crear();
    await expect(cola.eliminar(ID_C)).resolves.toBeUndefined();
  });

  it('RN-14: marca un registro como rechazado con el código y el mensaje, sin tocar los demás', async () => {
    const cola = crear();
    await cola.agregar(registro(ID_A, '2026-11-16T08:00:00-06:00'));
    await cola.agregar(registro(ID_B, '2026-11-16T08:05:00-06:00'));
    const mensaje = 'El registro sin conexión tiene más de 72 horas y ya no se puede enviar. Solicita una corrección a vinculación.';

    await cola.marcarRechazado(ID_A, { code: 'HORA_ANTIGUA', message: mensaje });

    const [a, b] = await cola.listar();
    expect(a).toMatchObject({ id: ID_A, token: `tok-${ID_A}`, estado: { tipo: 'RECHAZADO', code: 'HORA_ANTIGUA', message: mensaje } });
    expect(b?.estado).toEqual({ tipo: 'PENDIENTE' });
  });

  it('RF-16: marcar como rechazado un id inexistente no lo crea', async () => {
    const cola = crear();
    await cola.marcarRechazado(ID_C, { code: 'X', message: 'x' });
    expect(await cola.listar()).toEqual([]);
  });
});

describe('cola de pendientes en IndexedDB', () => {
  it('RF-16: los registros sobreviven a cerrar y volver a abrir la app', async () => {
    await crearColaIndexedDb().agregar(registro(ID_A, '2026-11-16T08:00:00-06:00'));

    // A new instance stands for the app opened again later.
    expect((await crearColaIndexedDb().listar()).map((r) => r.id)).toEqual([ID_A]);
  });

  it('RF-16: agregar el mismo id dos veces deja un solo registro', async () => {
    const cola = crearColaIndexedDb();
    await cola.agregar(registro(ID_A, '2026-11-16T08:00:00-06:00'));
    await cola.agregar(registro(ID_A, '2026-11-16T08:00:00-06:00'));
    expect(await cola.listar()).toHaveLength(1);
  });
});

describe('crearColaPendientes', () => {
  it('RF-16: usa IndexedDB cuando el navegador lo tiene', async () => {
    await crearColaPendientes().agregar(registro(ID_A, '2026-11-16T08:00:00-06:00'));
    expect(await crearColaIndexedDb().listar()).toHaveLength(1);
  });

  it('RF-16: usa memoria cuando no hay IndexedDB', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error simulate a browser without IndexedDB
    delete globalThis.indexedDB;
    try {
      const cola = crearColaPendientes();
      await cola.agregar(registro(ID_A, '2026-11-16T08:00:00-06:00'));
      expect(await cola.listar()).toHaveLength(1);
    } finally {
      globalThis.indexedDB = original;
    }
  });
});
