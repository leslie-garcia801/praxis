import { useState } from 'react';
import { Field } from '@/features/auth/components/Field';
import { useInstituciones, type TipoPrograma } from '../../instituciones/api';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

const BUSQUEDA_DEBOUNCE_MS = 300;

type Elegida = { id: string; nombre: string; municipio?: string };

type Props = {
  tipo: TipoPrograma;
  valueId: string;
  // What the expediente already has saved, so it shows even when the search hides it.
  guardada: { id: string; nombre: string } | null;
  onChange: (id: string) => void;
};

// RF-10: text search that filters the list (the API only returns active institutions to a student)
// and a radio group with name and municipality.
export function SelectorInstitucion({ tipo, valueId, guardada, onChange }: Props) {
  const [q, setQ] = useState('');
  const [elegida, setElegida] = useState<Elegida | null>(guardada);
  const qDebounced = useDebouncedValue(q.trim(), BUSQUEDA_DEBOUNCE_MS);
  const instituciones = useInstituciones({ tipo, q: qDebounced });

  const lista: Elegida[] = instituciones.data ?? [];
  const mostrarElegida = elegida !== null && elegida.id === valueId && !lista.some((i) => i.id === elegida.id);
  const filas = mostrarElegida ? [elegida, ...lista] : lista;

  function elegir(institucion: Elegida) {
    setElegida(institucion);
    onChange(institucion.id);
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-base font-semibold">Institución</legend>
      <Field
        id="buscar-institucion"
        label="Buscar institución"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
      />
      {instituciones.isError && (
        <ErrorConReintento
          message="No se pudieron cargar las instituciones."
          onRetry={() => void instituciones.refetch()}
        />
      )}
      {instituciones.isPending && <p>Cargando instituciones…</p>}
      {instituciones.data && filas.length === 0 && (
        <p className="text-slate-700">No hay instituciones que coincidan.</p>
      )}
      {filas.length > 0 && (
        <ul className="flex flex-col gap-2">
          {filas.map((i) => (
            <li key={i.id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-muted">
                <input
                  type="radio"
                  name="institucion"
                  className="size-5"
                  checked={valueId === i.id}
                  onChange={() => elegir(i)}
                />
                <span className="flex flex-col">
                  <span className="font-medium">{i.nombre}</span>
                  {i.municipio && <span className="text-sm text-slate-700">{i.municipio}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
