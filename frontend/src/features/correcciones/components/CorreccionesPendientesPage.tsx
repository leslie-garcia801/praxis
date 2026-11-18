import { Link } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { diaMonterrey, formatDiaCorto, formatFecha, formatHora } from '@/lib/tiempo';
import { textoRango } from '../../historial/rangoTurno';
import { messageOf } from '../../importaciones/archivo';
import { useCorreccionesPendientes, type CorreccionOficina } from '../api';
import { ResolverCorreccion } from './ResolverCorreccion';

const linkClass = 'text-primary underline underline-offset-4';

function TarjetaCorreccion({ correccion }: { correccion: CorreccionOficina }) {
  const tituloId = `correccion-${correccion.id}`;
  return (
    <article aria-labelledby={tituloId} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={tituloId} className="text-lg font-semibold">
          <Link to={`/vinculacion/expedientes/${correccion.expediente.id}`} className={linkClass}>
            {correccion.alumno.nombre}
          </Link>
        </h2>
        {correccion.alumno.matricula && <span className="text-muted-foreground">{correccion.alumno.matricula}</span>}
      </header>
      <p className="font-medium">Turno del {formatDiaCorto(diaMonterrey(correccion.turno.entrada))}</p>
      <dl className="flex flex-col gap-0.5 text-foreground">
        <div>
          <dt className="sr-only">Turno registrado</dt>
          <dd>Registrado: {textoRango(correccion.turno)}</dd>
        </div>
        <div>
          <dt className="sr-only">Horas propuestas</dt>
          <dd className="font-medium text-foreground">
            Propuesto: {formatHora(correccion.entradaNueva)} – {formatHora(correccion.salidaNueva)}
          </dd>
        </div>
      </dl>
      <p className="text-foreground">Motivo del alumno: «{correccion.motivo}»</p>
      <p className="text-sm text-muted-foreground">Solicitada el {formatFecha(correccion.creadoEn)}</p>
      <ResolverCorreccion correccionId={correccion.id} />
    </article>
  );
}

// RF-17, specs §10 (pantalla 5): the office's pending correction requests, oldest first (RN-03b in the API).
export function CorreccionesPendientesPage() {
  const correcciones = useCorreccionesPendientes();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-[1.75rem] font-extrabold">Correcciones pendientes</h1>
      {correcciones.isPending && <p role="status">Cargando correcciones…</p>}
      {correcciones.isError && <ErrorConReintento message={messageOf(correcciones.error)} onRetry={() => void correcciones.refetch()} />}
      {correcciones.data?.length === 0 && (
        <p role="status" className="rounded-lg border-2 border-info-borde bg-info p-3 text-info-foreground">
          No hay correcciones pendientes
        </p>
      )}
      {correcciones.data && correcciones.data.length > 0 && (
        <div className="flex flex-col gap-3">
          {correcciones.data.map((c) => (
            <TarjetaCorreccion key={c.id} correccion={c} />
          ))}
        </div>
      )}
    </main>
  );
}
