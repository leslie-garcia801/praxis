import { Button } from '@/components/ui/button';
import { useEstadoCola } from '@/offline/estadoCola';
import { formatFecha, formatHora } from '@/lib/tiempo';

function textoPendientes(cantidad: number): string {
  return cantidad === 1 ? '1 registro pendiente de sincronizar' : `${cantidad} registros pendientes de sincronizar`;
}

// RF-16: "Sin conexión" notice for the student screens that cannot show data without a network.
export function AvisoSinConexion() {
  return (
    <div role="status" className="flex flex-col gap-1 rounded-lg border bg-muted p-3 text-foreground">
      <p className="font-semibold">Sin conexión</p>
      <p>Puedes registrar tu asistencia; se enviará cuando tengas conexión.</p>
    </div>
  );
}

// RF-16: how many scans wait on this device, and the sign-in notice when the last send was refused
// because the session expired.
export function EstadoRegistrosPendientes() {
  const { pendientes, detenidoPor } = useEstadoCola();
  if (pendientes === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p role="status" className="font-medium">
        {textoPendientes(pendientes)}
      </p>
      {detenidoPor === 'SESION' && (
        <p role="alert" className="text-destructive">
          Inicia sesión para enviar tus registros pendientes.
        </p>
      )}
    </div>
  );
}

// RN-14: scans the server refused for good (for example, older than 72 h). The student reads the
// server's message and dismisses them.
export function RegistrosRechazados() {
  const { rechazados, descartar } = useEstadoCola();
  if (rechazados.length === 0) return null;
  return (
    <section aria-labelledby="rechazados-titulo" className="flex flex-col gap-2">
      <h2 id="rechazados-titulo" className="text-lg font-semibold">
        Registros que no se aceptaron
      </h2>
      <ul aria-label="Registros que no se aceptaron" className="flex flex-col gap-2">
        {rechazados.map((registro) => (
          <li key={registro.id} className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3">
            <p className="font-medium">{`Registro del ${formatFecha(registro.hora)} a las ${formatHora(registro.hora)}`}</p>
            <p className="text-foreground">{registro.estado.message}</p>
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => void descartar(registro.id)}>
              Descartar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
