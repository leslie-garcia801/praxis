import { Link } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { formatRangoSemana } from '@/lib/tiempo';
import { usePendientes, type Pendiente } from '../api';

function textoPendiente(p: Pendiente): string {
  const rango = formatRangoSemana(p.semanaInicio, p.semanaFin);
  switch (p.motivo) {
    case 'RECHAZADA':
      return `Corrige la bitácora de la semana del ${rango}`;
    case 'BITACORA_PENDIENTE':
      return `Escribe la bitácora de la semana del ${rango} para enviarla`;
    case 'BITACORA_SEMANA_ACTUAL':
      return 'Escribe la bitácora de esta semana';
  }
}

// RF-18 (point 5): weeks that need the student's attention, each linking to its logbook.
export function PendientesAlumno() {
  const pendientes = usePendientes();

  return (
    <section aria-labelledby="pendientes-titulo" className="flex flex-col gap-2">
      <h2 id="pendientes-titulo" className="text-lg font-semibold">
        Pendientes
      </h2>
      {pendientes.isPending && <p>Cargando tus pendientes…</p>}
      {pendientes.isError && (
        <ErrorConReintento message="No se pudieron cargar tus pendientes." onRetry={() => void pendientes.refetch()} />
      )}
      {pendientes.data?.length === 0 && <p className="text-slate-800">No tienes pendientes</p>}
      {pendientes.data && pendientes.data.length > 0 && (
        <ul aria-label="Pendientes" className="flex flex-col gap-2">
          {pendientes.data.map((p) => (
            <li key={p.id} className="flex flex-col gap-1 rounded-lg border p-3">
              <Link
                to={`/alumno/historial?semana=${encodeURIComponent(p.semanaInicio)}`}
                className="text-primary underline underline-offset-4"
              >
                {textoPendiente(p)}
              </Link>
              {p.comentario && <p className="text-slate-800">Comentario de tu supervisor: «{p.comentario}»</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
