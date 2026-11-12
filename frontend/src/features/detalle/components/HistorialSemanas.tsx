import { useSearchParams } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { Button } from '@/components/ui/button';
import { formatFecha, formatHoras, formatRangoSemana, hoyMonterrey, sumarDias } from '@/lib/tiempo';
import { messageOf } from '../../importaciones/archivo';
import { DiaHistorial } from '../../historial/components/DiaHistorial';
import type { EstadoValidacion, SemanaHistorial } from '../../historial/api';
import { useSemanaDeExpediente } from '../api';

const PARAM_SEMANA = 'semana';

const TEXTO_VALIDACION: Record<EstadoValidacion, string> = {
  BORRADOR: 'Sin enviar',
  ENVIADA: 'Enviada al supervisor',
  VALIDADA: 'Validada',
  RECHAZADA: 'Rechazada',
};

// Read-only logbook: the office never edits it (RF-20).
function BitacoraLectura({ semana }: { semana: SemanaHistorial }) {
  return (
    <section aria-labelledby="detalle-bitacora" className="flex flex-col gap-2">
      <h3 id="detalle-bitacora" className="text-lg font-semibold">
        Bitácora
      </h3>
      {semana.id === null ? (
        <p role="status" className="rounded-lg border bg-muted p-3 text-slate-800">
          La semana aún no tiene registros ni bitácora
        </p>
      ) : (
        <>
          <p className="whitespace-pre-wrap rounded-lg border bg-muted p-3 text-slate-900">
            {semana.actividades?.trim() ? semana.actividades : 'Sin bitácora'}
          </p>
          {semana.enviadaEn && <p className="text-slate-800">Enviada el {formatFecha(semana.enviadaEn)}</p>}
          {semana.estadoValidacion === 'RECHAZADA' && semana.comentario && (
            <p className="text-slate-800">Comentario del supervisor: «{semana.comentario}»</p>
          )}
        </>
      )}
    </section>
  );
}

function SemanaContenido({ semana, onIr }: { semana: SemanaHistorial; onIr: (fecha: string) => void }) {
  // The next week is disabled once the shown week reaches today (Monterrey calendar day).
  const esActual = semana.fin >= hoyMonterrey();
  const sinTurnos = semana.dias.every((dia) => dia.turnos.length === 0);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">Semana del {formatRangoSemana(semana.inicio, semana.fin)}</h3>
        <p className="text-slate-800">{semana.estadoValidacion ? TEXTO_VALIDACION[semana.estadoValidacion] : 'Sin registros'}</p>
      </header>
      <div className="flex max-w-md gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => onIr(sumarDias(semana.inicio, -7))}>
          Semana anterior
        </Button>
        <Button type="button" variant="outline" className="flex-1" disabled={esActual} onClick={() => onIr(sumarDias(semana.inicio, 7))}>
          Semana siguiente
        </Button>
      </div>
      {sinTurnos ? (
        <p role="status" className="rounded-lg border bg-muted p-3 text-slate-800">
          No hay registros esta semana
        </p>
      ) : (
        <>
          <div className="flex max-w-md flex-col gap-4">
            {semana.dias.map((dia) => (
              <DiaHistorial key={dia.fecha} dia={dia} />
            ))}
          </div>
          <p className="text-lg font-semibold">Total de la semana: {formatHoras(semana.totales.minutosAcreditables)}</p>
        </>
      )}
      <BitacoraLectura semana={semana} />
    </>
  );
}

// RF-19, RF-25: week by week, the shifts (Monterrey time) and the logbook of the case file. The week lives in the URL.
export function HistorialSemanas({ expedienteId }: { expedienteId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const semana = useSemanaDeExpediente(expedienteId, searchParams.get(PARAM_SEMANA) ?? undefined);

  function irASemana(fecha: string) {
    const next = new URLSearchParams(searchParams);
    next.set(PARAM_SEMANA, fecha);
    setSearchParams(next);
  }

  return (
    <section aria-labelledby="detalle-historial" className="flex flex-col gap-3">
      <h2 id="detalle-historial" className="text-xl font-semibold">
        Historial por semana
      </h2>
      {semana.isPending && <p role="status">Cargando historial…</p>}
      {semana.isError && <ErrorConReintento message={messageOf(semana.error)} onRetry={() => void semana.refetch()} />}
      {semana.data && <SemanaContenido semana={semana.data} onIr={irASemana} />}
    </section>
  );
}
