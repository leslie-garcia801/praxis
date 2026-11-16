import { createContext, useContext } from 'react';
import { crearColaPendientes } from './almacenamientoIndexedDb';
import type { ColaPendientes } from './tipos';

let instancia: ColaPendientes | null = null;

// One queue for the whole app (RF-16), created on first use.
export function obtenerCola(): ColaPendientes {
  instancia ??= crearColaPendientes();
  return instancia;
}

// Tests provide an in-memory queue (or one on fake-indexeddb) through this context.
export const ColaContext = createContext<ColaPendientes | null>(null);

export function useCola(): ColaPendientes {
  return useContext(ColaContext) ?? obtenerCola();
}
