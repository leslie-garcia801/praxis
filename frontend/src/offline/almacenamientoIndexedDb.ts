import { crearColaEnMemoria } from './almacenamientoMemoria';
import type { ColaPendientes, Rechazo, RegistroPendiente } from './tipos';

const DB_NAME = 'praxis-sin-conexion';
const STORE = 'registrosPendientes';
const INDICE_CREADO_EN = 'creadoEn';

function promesa<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function terminada(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function abrir(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
    store.createIndex(INDICE_CREADO_EN, 'creadoEn');
  };
  return promesa(request);
}

// One database, one object store keyed by `id`, ordered by the `creadoEn` index.
export function crearColaIndexedDb(): ColaPendientes {
  let conexion: Promise<IDBDatabase> | undefined;
  const db = () => (conexion ??= abrir());

  async function escribir(accion: (store: IDBObjectStore) => void): Promise<void> {
    const tx = (await db()).transaction(STORE, 'readwrite');
    accion(tx.objectStore(STORE));
    await terminada(tx);
  }

  return {
    agregar: (registro) => escribir((store) => void store.put(registro)),
    async listar() {
      const store = (await db()).transaction(STORE, 'readonly').objectStore(STORE);
      return promesa<RegistroPendiente[]>(store.index(INDICE_CREADO_EN).getAll());
    },
    eliminar: (id) => escribir((store) => void store.delete(id)),
    async marcarRechazado(id: string, rechazo: Rechazo) {
      const tx = (await db()).transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const fin = terminada(tx);
      const actual = await promesa<RegistroPendiente | undefined>(store.get(id));
      if (actual) store.put({ ...actual, estado: { tipo: 'RECHAZADO', ...rechazo } });
      await fin;
    },
  };
}

// IndexedDB when the browser has it, memory otherwise.
export function crearColaPendientes(): ColaPendientes {
  return typeof indexedDB === 'undefined' ? crearColaEnMemoria() : crearColaIndexedDb();
}
