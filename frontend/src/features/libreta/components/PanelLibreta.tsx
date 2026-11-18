import { Link } from 'react-router';
import type { SemanaHistorial } from '../../historial/api';
import { TEXTO_SIN_BITACORA } from './EtiquetaLibreta';

// RF-17a: replaces the logbook of a notebook week. A rejected week can be corrected by replacing its shifts.
export function PanelLibreta({ semana }: { semana: SemanaHistorial }) {
  return (
    <section aria-labelledby="libreta-titulo" className="flex flex-col gap-3">
      <h3 id="libreta-titulo" className="text-lg font-semibold">
        Horas de libreta
      </h3>
      <p className="rounded-lg border bg-muted p-3 text-foreground">{TEXTO_SIN_BITACORA}</p>
      {semana.estadoValidacion === 'RECHAZADA' && semana.comentario && (
        <p role="alert" className="rounded-lg border border-destructive bg-destructive/10 p-3 font-medium text-destructive">
          Tu supervisor la rechazó: «{semana.comentario}»
        </p>
      )}
      {semana.puedeCorregirLibreta && (
        <Link
          to={`/alumno/libreta?corregir=${encodeURIComponent(semana.inicio)}`}
          className="inline-flex h-12 items-center justify-center rounded-lg bg-primary px-4 font-medium text-primary-foreground"
        >
          Corregir turnos
        </Link>
      )}
    </section>
  );
}
