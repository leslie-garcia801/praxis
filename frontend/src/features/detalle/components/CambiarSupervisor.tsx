import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useSupervisores } from '../../expediente/api';
import { nombreSupervisor } from '../../expediente/nombreSupervisor';
import { messageOf } from '../../importaciones/archivo';
import { useCambiarSupervisor, type ExpedienteDetalle } from '../api';

// RF-10, RF-12: the office can change the supervisor while the case file is still open.
const ESTADOS_EDITABLES: ExpedienteDetalle['estado'][] = ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'];

const linkClass = 'text-primary underline underline-offset-4';

function Formulario({ expediente, institucionId, onCerrar, onListo }: { expediente: ExpedienteDetalle; institucionId: string; onCerrar: () => void; onListo: () => void }) {
  const supervisores = useSupervisores(institucionId);
  const cambiar = useCambiarSupervisor(expediente.id);
  const [elegido, setElegido] = useState('');
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const [errorApi, setErrorApi] = useState<string | null>(null);

  // Only active supervisors, and not the one already assigned.
  const opciones = (supervisores.data ?? []).filter((s) => s.activo !== false && s.id !== expediente.supervisor?.id);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErrorApi(null);
    if (!elegido) {
      setErrorCampo('Elige el supervisor nuevo.');
      return;
    }
    setErrorCampo(null);
    try {
      await cambiar.mutateAsync(elegido);
      onListo();
    } catch (err) {
      setErrorApi(messageOf(err));
    }
  }

  return (
    <form aria-label="Cambiar supervisor" onSubmit={(e) => void enviar(e)} noValidate className="flex max-w-xl flex-col gap-3 rounded-lg border p-3">
      <h3 className="text-base font-semibold">Cambiar supervisor</h3>
      {supervisores.isPending && (
        <p role="status" className="text-muted-foreground">
          Cargando supervisores…
        </p>
      )}
      {supervisores.isError && <ErrorConReintento message={messageOf(supervisores.error)} onRetry={() => void supervisores.refetch()} />}
      {supervisores.data && opciones.length === 0 && <p>No hay otro supervisor activo en esta institución.</p>}
      {supervisores.data && opciones.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supervisor-nuevo">Supervisor nuevo</Label>
          <select
            id="supervisor-nuevo"
            className="h-11 rounded-lg border border-input bg-background px-3 text-foreground"
            value={elegido}
            onChange={(e) => setElegido(e.target.value)}
            aria-invalid={errorCampo ? true : undefined}
          >
            <option value="">Elige un supervisor</option>
            {opciones.map((s) => (
              <option key={s.id} value={s.id}>
                {nombreSupervisor(s)}
              </option>
            ))}
          </select>
          {errorCampo && <p className="text-sm text-destructive">{errorCampo}</p>}
        </div>
      )}
      <Link to={`/vinculacion/instituciones/${institucionId}/editar`} className={linkClass}>
        Agregar un supervisor en la institución
      </Link>
      {errorApi && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorApi}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {opciones.length > 0 && (
          <Button type="submit" disabled={cambiar.isPending}>
            {cambiar.isPending ? 'Guardando…' : 'Guardar supervisor nuevo'}
          </Button>
        )}
        <Button type="button" variant="outline" disabled={cambiar.isPending} onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
    </form>
  );
}

// Button plus inline form in the detail of the case file. Hidden when the case file cannot be edited
// or has no institution yet (the supervisors belong to an institution).
export function CambiarSupervisor({ expediente }: { expediente: ExpedienteDetalle }) {
  const [abierto, setAbierto] = useState(false);
  const [exito, setExito] = useState(false);
  if (!ESTADOS_EDITABLES.includes(expediente.estado) || !expediente.institucion) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          aria-expanded={abierto}
          onClick={() => {
            setExito(false);
            setAbierto(!abierto);
          }}
        >
          Cambiar supervisor
        </Button>
        {exito && <p role="status">Supervisor cambiado.</p>}
      </div>
      {abierto && (
        <Formulario
          expediente={expediente}
          institucionId={expediente.institucion.id}
          onCerrar={() => setAbierto(false)}
          onListo={() => {
            setAbierto(false);
            setExito(true);
          }}
        />
      )}
    </div>
  );
}
