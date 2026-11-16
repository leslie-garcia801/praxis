import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { useActualizarSupervisor, useSupervisores, type Supervisor } from '@/features/expediente/api';
import { NuevoSupervisorForm } from '@/features/expediente/components/NuevoSupervisorForm';
import { nombreSupervisor } from '@/features/expediente/nombreSupervisor';
import { messageOf } from '@/features/importaciones/archivo';
import { EditarSupervisorForm } from './EditarSupervisorForm';

// One supervisor of the list: its data and the office actions (edit, deactivate or reactivate).
function SupervisorItem({
  supervisor,
  institucionId,
  editando,
  onEditar,
  onCerrarEdicion,
}: {
  supervisor: Supervisor;
  institucionId: string;
  editando: boolean;
  onEditar: () => void;
  onCerrarEdicion: () => void;
}) {
  const actualizar = useActualizarSupervisor(institucionId, supervisor.id);
  const [error, setError] = useState<string | null>(null);
  const nombre = nombreSupervisor(supervisor);
  const inactivo = supervisor.activo === false;

  async function cambiarActivo(activo: boolean) {
    setError(null);
    try {
      await actualizar.mutateAsync({ activo });
    } catch (e) {
      // For instance: it still has active case files, and the API says how many.
      setError(messageOf(e));
    }
  }

  if (editando) {
    return (
      <li>
        <EditarSupervisorForm supervisor={supervisor} institucionId={institucionId} onListo={onCerrarEdicion} onCancelar={onCerrarEdicion} />
      </li>
    );
  }

  return (
    <li className={`flex flex-col gap-1 rounded-lg border p-3 ${inactivo ? 'bg-muted' : ''}`}>
      <span className="font-medium">{nombre}</span>
      {supervisor.puesto && <span className="text-sm text-muted-foreground">{supervisor.puesto}</span>}
      {(supervisor.correo || supervisor.telefono) && (
        <span className="text-sm text-muted-foreground">{[supervisor.correo, supervisor.telefono].filter(Boolean).join(' · ')}</span>
      )}
      {!supervisor.confirmado && <span className="text-sm font-medium text-amber-800 dark:text-amber-400">Por confirmar</span>}
      {inactivo && <span className="text-sm font-medium text-muted-foreground">Inactivo</span>}
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-1 flex gap-2">
        <Button type="button" variant="outline" size="sm" aria-label={`Editar a ${nombre}`} onClick={onEditar}>
          Editar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${inactivo ? 'Reactivar' : 'Desactivar'} a ${nombre}`}
          disabled={actualizar.isPending}
          onClick={() => void cambiarActivo(inactivo)}
        >
          {inactivo ? 'Reactivar' : 'Desactivar'}
        </Button>
      </div>
    </li>
  );
}

// RF-09: the office sees the supervisors of an institution, registers new ones (confirmed from the start),
// fixes their data and deactivates the ones that no longer apply.
export function SupervisoresInstitucion({ institucionId }: { institucionId: string }) {
  const supervisores = useSupervisores(institucionId);
  const [agregando, setAgregando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  return (
    <section aria-label="Supervisores" className="flex flex-col gap-3 border-t pt-6">
      <h2 className="text-lg font-semibold">Supervisores</h2>
      {supervisores.isPending && (
        <p role="status" className="text-muted-foreground">
          Cargando supervisores…
        </p>
      )}
      {supervisores.isError && (
        <ErrorConReintento message={messageOf(supervisores.error)} onRetry={() => void supervisores.refetch()} />
      )}
      {supervisores.data &&
        (supervisores.data.length === 0 ? (
          <p className="text-muted-foreground">Aún no hay supervisores en esta institución.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {supervisores.data.map((s) => (
              <SupervisorItem
                key={s.id}
                supervisor={s}
                institucionId={institucionId}
                editando={editandoId === s.id}
                onEditar={() => setEditandoId(s.id)}
                onCerrarEdicion={() => setEditandoId(null)}
              />
            ))}
          </ul>
        ))}
      {agregando ? (
        <NuevoSupervisorForm institucionId={institucionId} onCreado={() => setAgregando(false)} />
      ) : (
        <Button type="button" variant="outline" className="h-11 w-fit" onClick={() => setAgregando(true)}>
          Nuevo supervisor
        </Button>
      )}
    </section>
  );
}
