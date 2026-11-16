import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { avanceKeys } from '@/features/avance/api';
import { meKey, useUsuarioId } from '@/features/auth/api';
import { pendientesKeys } from '@/features/bitacora/api';
import { correccionesKeys } from '@/features/correcciones/api';
import { registrarEscaneo } from '@/features/escaneo/api';
import { historialKeys } from '@/features/historial/api';
import { descartarRechazado } from './cola';
import { useCola } from './colaCompartida';
import { EstadoColaContext, type EstadoCola, type RegistroRechazado } from './estadoCola';
import { sincronizarPendientes, type MotivoDetencion } from './sincronizar';
import type { RegistroPendiente } from './tipos';

function esRechazado(registro: RegistroPendiente): registro is RegistroRechazado {
  return registro.estado.tipo === 'RECHAZADO';
}

// RF-16, RN-14: mounted only for a signed-in student (or one reopening the app offline). Sends the
// queue when the app opens and when the connection comes back (iOS has no Background Sync), keeps
// the queue state for the screens, and refreshes the attendance data after a successful send.
export function SincronizacionProvider({ children }: { children: ReactNode }) {
  const cola = useCola();
  const queryClient = useQueryClient();
  const usuarioId = useUsuarioId();
  const [todos, setTodos] = useState<RegistroPendiente[]>([]);
  // Only the signed-in student's records are counted and listed.
  const registros = useMemo(() => todos.filter((r) => usuarioId !== undefined && r.usuarioId === usuarioId), [todos, usuarioId]);
  const [detenidoPor, setDetenidoPor] = useState<MotivoDetencion | undefined>();

  const refrescar = useCallback(async () => {
    try {
      setTodos(await cola.listar());
    } catch {
      setTodos([]);
    }
  }, [cola]);

  const sincronizar = useCallback(async () => {
    if (usuarioId === undefined) return;
    try {
      const resumen = await sincronizarPendientes(cola, registrarEscaneo, usuarioId);
      setDetenidoPor(resumen.detenidoPor);
      await refrescar();
      if (resumen.enviados > 0) {
        await Promise.all(
          [meKey, avanceKeys.all, historialKeys.all, pendientesKeys.all, correccionesKeys.all].map((queryKey) =>
            queryClient.invalidateQueries({ queryKey }),
          ),
        );
      }
    } catch {
      // The queue itself failed (storage error): the records stay where they are.
    }
  }, [cola, queryClient, refrescar, usuarioId]);

  const descartar = useCallback(
    async (id: string) => {
      await descartarRechazado(cola, id);
      await refrescar();
    },
    [cola, refrescar],
  );

  useEffect(() => {
    async function alAbrir() {
      await refrescar();
      if (navigator.onLine !== false) await sincronizar();
    }
    void alAbrir();
    const alVolverLaConexion = () => void sincronizar();
    window.addEventListener('online', alVolverLaConexion);
    return () => window.removeEventListener('online', alVolverLaConexion);
  }, [refrescar, sincronizar]);

  const estado = useMemo<EstadoCola>(
    () => ({
      pendientes: registros.filter((r) => r.estado.tipo === 'PENDIENTE').length,
      rechazados: registros.filter(esRechazado),
      detenidoPor,
      refrescar,
      descartar,
    }),
    [registros, detenidoPor, refrescar, descartar],
  );

  return <EstadoColaContext.Provider value={estado}>{children}</EstadoColaContext.Provider>;
}
