import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { useSupervisores } from '@/features/expediente/api';
import { messageOf } from '@/features/importaciones/archivo';
import { NuevoSupervisorForm } from '@/features/expediente/components/NuevoSupervisorForm';
import { nombreSupervisor } from '@/features/expediente/nombreSupervisor';

// RF-09: the office sees the supervisors of an institution and registers new ones (confirmed from the start).
export function SupervisoresInstitucion({ institucionId }: { institucionId: string }) {
  const supervisores = useSupervisores(institucionId);
  const [agregando, setAgregando] = useState(false);

  return (
    <section aria-label="Supervisores" className="flex flex-col gap-3 border-t pt-6">
      <h2 className="text-lg font-semibold">Supervisores</h2>
      {supervisores.isPending && (
        <p role="status" className="text-slate-700">
          Cargando supervisores…
        </p>
      )}
      {supervisores.isError && (
        <ErrorConReintento message={messageOf(supervisores.error)} onRetry={() => void supervisores.refetch()} />
      )}
      {supervisores.data &&
        (supervisores.data.length === 0 ? (
          <p className="text-slate-700">Aún no hay supervisores en esta institución.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {supervisores.data.map((s) => (
              <li key={s.id} className="flex flex-col rounded-lg border p-3">
                <span className="font-medium">{nombreSupervisor(s)}</span>
                {s.puesto && <span className="text-sm text-slate-700">{s.puesto}</span>}
                {(s.correo || s.telefono) && (
                  <span className="text-sm text-slate-700">{[s.correo, s.telefono].filter(Boolean).join(' · ')}</span>
                )}
                {!s.confirmado && <span className="text-sm font-medium text-amber-800">Por confirmar</span>}
              </li>
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
