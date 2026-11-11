import { useState } from 'react';
import { useSupervisores, type Supervisor } from '../api';
import { nombreSupervisor } from '../nombreSupervisor';
import { ErrorConReintento } from './ErrorConReintento';
import { NuevoSupervisorForm } from './NuevoSupervisorForm';

type Props = {
  institucionId: string | undefined;
  valueId: string;
  onChange: (id: string) => void;
};

const filaClass =
  'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-muted';

// RF-09, RF-10: supervisors of the chosen institution, or register a new one. The component is keyed by
// institution in the parent, so changing institution drops what was created here.
function Lista({ institucionId, valueId, onChange }: Props & { institucionId: string }) {
  const supervisores = useSupervisores(institucionId);
  const [abierto, setAbierto] = useState(false);
  // A supervisor the student just created is pending: the API does not list it for the student.
  const [creados, setCreados] = useState<Supervisor[]>([]);
  const [aviso, setAviso] = useState(false);

  const lista = [...(supervisores.data ?? [])];
  for (const c of creados) if (!lista.some((s) => s.id === c.id)) lista.push(c);

  function elegir(id: string) {
    setAbierto(false);
    onChange(id);
  }

  return (
    <>
      {supervisores.isError && (
        <ErrorConReintento
          message="No se pudieron cargar los supervisores."
          onRetry={() => void supervisores.refetch()}
        />
      )}
      {supervisores.isPending && <p>Cargando supervisores…</p>}
      {supervisores.data && (
        <ul className="flex flex-col gap-2">
          {lista.map((s) => (
            <li key={s.id}>
              <label className={filaClass}>
                <input
                  type="radio"
                  name="supervisor"
                  className="size-5"
                  checked={!abierto && valueId === s.id}
                  onChange={() => elegir(s.id)}
                />
                <span className="flex flex-col">
                  <span className="font-medium">{nombreSupervisor(s)}</span>
                  {s.puesto && <span className="text-sm text-slate-700">{s.puesto}</span>}
                </span>
              </label>
            </li>
          ))}
          <li>
            <label className={filaClass}>
              <input
                type="radio"
                name="supervisor"
                className="size-5"
                checked={abierto}
                onChange={() => {
                  setAbierto(true);
                  setAviso(false);
                  onChange('');
                }}
              />
              <span className="font-medium">Mi supervisor no aparece</span>
            </label>
          </li>
        </ul>
      )}
      {abierto && (
        <NuevoSupervisorForm
          institucionId={institucionId}
          onCreado={(s) => {
            setCreados((previos) => [...previos, s]);
            setAbierto(false);
            setAviso(true);
            onChange(s.id);
          }}
        />
      )}
      {aviso && !abierto && (
        <p role="status" className="rounded-lg border bg-muted p-3 text-slate-800">
          Vinculación revisará los datos de tu supervisor
        </p>
      )}
    </>
  );
}

export function SelectorSupervisor({ institucionId, valueId, onChange }: Props) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-base font-semibold">Supervisor</legend>
      {institucionId ? (
        <Lista key={institucionId} institucionId={institucionId} valueId={valueId} onChange={onChange} />
      ) : (
        <p className="text-slate-700">Elige primero una institución para ver sus supervisores.</p>
      )}
    </fieldset>
  );
}
