import type { ColaPendientes, Rechazo, RegistroPendiente } from './tipos';

// In-memory queue: used by unit tests and as a fallback when IndexedDB is unavailable.
export function crearColaEnMemoria(): ColaPendientes {
  const registros = new Map<string, RegistroPendiente>();
  return {
    async agregar(registro) {
      registros.set(registro.id, registro);
    },
    async listar() {
      return [...registros.values()].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
    },
    async eliminar(id) {
      registros.delete(id);
    },
    async marcarRechazado(id: string, rechazo: Rechazo) {
      const actual = registros.get(id);
      if (actual) registros.set(id, { ...actual, estado: { tipo: 'RECHAZADO', ...rechazo } });
    },
  };
}
