import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { NOMBRE_PROGRAMA } from '@/lib/oficinas';
import type { ResultadoAsignacion } from '../api';

type Props = {
  resultado: ResultadoAsignacion;
  // Names of the students that were sent, by id (the list refreshes and drops the assigned ones).
  nombres: ReadonlyMap<string, string>;
  onCerrar: () => void;
};

const linkClass = 'text-primary underline underline-offset-4';

// Summary of one assignment: who got a new case file (with a link to it) and who was skipped, and why.
export function ResultadoAsignacionPanel({ resultado, nombres, onCerrar }: Props) {
  const nombreDe = (id: string) => nombres.get(id) ?? 'Alumno';
  return (
    <section aria-label="Resultado de la asignación" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-bold">Resultado de la asignación</h2>
        <Button type="button" variant="outline" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
      {resultado.asignados.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">{`Asignados (${resultado.asignados.length})`}</h3>
          <ul className="flex flex-col gap-1">
            {resultado.asignados.map((a) => (
              <li key={a.alumnoId} className="flex flex-wrap gap-x-2">
                <span>{`${nombreDe(a.alumnoId)} · ${NOMBRE_PROGRAMA[a.tipo]}`}</span>
                <Link to={`/vinculacion/expedientes/${a.expedienteId}`} aria-label={`Ver expediente de ${nombreDe(a.alumnoId)}`} className={linkClass}>
                  Ver expediente
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {resultado.omitidos.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">{`No asignados (${resultado.omitidos.length})`}</h3>
          <ul className="flex flex-col gap-1">
            {resultado.omitidos.map((o) => (
              <li key={o.alumnoId} className="flex flex-col">
                <span>{nombreDe(o.alumnoId)}</span>
                <span className="text-sm text-muted-foreground">{o.motivo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
