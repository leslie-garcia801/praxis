import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { Button } from '@/components/ui/button';
import { activarPush, desactivarPush, detectarEstado, pushKeys } from '../push';

const DESCRIPCION = 'Te avisamos si olvidas registrar tu salida y el domingo para escribir tu bitácora.';

function Tarjeta({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Recordatorios" className="flex flex-col gap-2 rounded-lg border p-3">
      <h2 className="font-semibold">Recordatorios</h2>
      <p className="text-foreground">{DESCRIPCION}</p>
      {children}
    </section>
  );
}

// RF-28: lets the student turn push reminders on or off on this device.
// Hidden (renders nothing) while checking and whenever push is not available: no support, no service worker or server without keys.
export function RecordatoriosCard() {
  const queryClient = useQueryClient();
  const estado = useQuery({ queryKey: pushKeys.estado, queryFn: detectarEstado, staleTime: Infinity, retry: false });
  const refrescar = () => queryClient.invalidateQueries({ queryKey: pushKeys.estado });

  const activar = useMutation({ mutationFn: activarPush, onSuccess: refrescar });
  const desactivar = useMutation({ mutationFn: desactivarPush, onSuccess: refrescar });

  if (estado.isError) {
    return (
      <Tarjeta>
        <ErrorConReintento message="No se pudo revisar los recordatorios. Intenta de nuevo." onRetry={() => void estado.refetch()} />
      </Tarjeta>
    );
  }
  const actual = estado.data;
  if (!actual || actual.tipo === 'no-disponible') return null;

  switch (actual.tipo) {
    case 'instalar':
      return (
        <Tarjeta>
          <div role="status" className="flex flex-col gap-1 rounded-lg border bg-muted p-3 text-foreground">
            <p>Para recibir recordatorios en iPhone, agrega la app a tu pantalla de inicio: toca Compartir y luego Agregar a inicio.</p>
            <p className="text-sm">Necesitas iOS 16.4 o más reciente.</p>
          </div>
        </Tarjeta>
      );
    case 'bloqueado':
      return (
        <Tarjeta>
          <p className="rounded-lg border bg-muted p-3 text-foreground">
            Bloqueaste las notificaciones de esta app. Para recibir recordatorios, actívalas en los ajustes del navegador o del
            teléfono.
          </p>
        </Tarjeta>
      );
    case 'activo':
      return (
        <Tarjeta>
          <p className="font-medium">Recordatorios activados</p>
          {desactivar.isError ? (
            <ErrorConReintento
              message="No se pudieron desactivar los recordatorios. Intenta de nuevo."
              onRetry={() => desactivar.mutate()}
            />
          ) : (
            <Button variant="outline" className="h-12" disabled={desactivar.isPending} onClick={() => desactivar.mutate()}>
              Desactivar
            </Button>
          )}
        </Tarjeta>
      );
    case 'inactivo':
      return (
        <Tarjeta>
          {activar.isError ? (
            <ErrorConReintento
              message="No se pudieron activar los recordatorios. Intenta de nuevo."
              onRetry={() => activar.mutate(actual.clavePublica)}
            />
          ) : (
            <Button className="h-12" disabled={activar.isPending} onClick={() => activar.mutate(actual.clavePublica)}>
              Activar recordatorios
            </Button>
          )}
        </Tarjeta>
      );
  }
}
