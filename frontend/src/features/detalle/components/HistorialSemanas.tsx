import { useSearchParams } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SeccionCard } from '@/components/SeccionCard';
import { formatFecha, formatHoras, formatRangoSemana, hoyMonterrey, sumarDias } from '@/lib/tiempo';
import { messageOf } from '../../importaciones/archivo';
import { DiaHistorial } from '../../historial/components/DiaHistorial';
import type { EstadoValidacion, SemanaHistorial } from '../../historial/api';
import { EtiquetaLibreta, TEXTO_SIN_BITACORA } from '../../libreta/components/EtiquetaLibreta';
import { VARIANTE_VALIDACION } from '../../historial/varianteValidacion';
import { useSemanaDeExpediente } from '../api';
import { AccionesSemana } from './AccionesSemana';

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
    <SeccionCard aria-labelledby="detalle-bitacora" className="gap-2">
      <h3 id="detalle-bitacora" className="font-heading text-lg font-bold">
        Bitácora
      </h3>
      {semana.deLibreta ? (
        <>
          <p className="rounded-lg border-2 border-info-borde bg-info p-3 text-info-foreground">{TEXTO_SIN_BITACORA}</p>
          {semana.enviadaEn && <p className="text-foreground">Enviada el {formatFecha(semana.enviadaEn)}</p>}
          {semana.estadoValidacion === 'RECHAZADA' && semana.comentario && (
            <p className="text-foreground">Comentario del supervisor: «{semana.comentario}»</p>
          )}
        </>
      ) : semana.id === null ? (
        <p role="status" className="rounded-lg border-2 border-info-borde bg-info p-3 text-info-foreground">
          La semana aún no tiene registros ni bitácora
        </p>
      ) : (
        <>
          <p className="whitespace-pre-wrap rounded-lg border bg-muted p-3 text-foreground">
            {semana.actividades?.trim() ? semana.actividades : 'Sin bitácora'}
          </p>
          {semana.enviadaEn && <p className="text-foreground">Enviada el {formatFecha(semana.enviadaEn)}</p>}
          {semana.estadoValidacion === 'RECHAZADA' && semana.comentario && (
            <p className="text-foreground">Comentario del supervisor: «{semana.comentario}»</p>
          )}
        </>
      )}
    </SeccionCard>
  );
}

function SemanaContenido({ semana, onIr }: { semana: SemanaHistorial; onIr: (fecha: string) => void }) {
  // The next week is disabled once the shown week reaches today (Monterrey calendar day).
  const esActual = semana.fin >= hoyMonterrey();
  const sinTurnos = semana.dias.every((dia) => dia.turnos.length === 0);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h3 className="font-heading text-lg font-bold">Semana del {formatRangoSemana(semana.inicio, semana.fin)}</h3>
        <p>
          <Badge variant={semana.estadoValidacion ? VARIANTE_VALIDACION[semana.estadoValidacion] : 'neutral'}>
            {semana.estadoValidacion ? TEXTO_VALIDACION[semana.estadoValidacion] : 'Sin registros'}
          </Badge>
        </p>
        {semana.deLibreta && <EtiquetaLibreta />}
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
        <p role="status" className="rounded-lg border-2 border-info-borde bg-info p-3 text-info-foreground">
          No hay registros esta semana
        </p>
      ) : (
        <>
          <div className="flex max-w-md flex-col gap-3">
            {semana.dias.map((dia) => (
              <DiaHistorial key={dia.fecha} dia={dia} vista="oficina" />
            ))}
          </div>
          <p className="max-w-md rounded-lg bg-accent px-3 py-2 font-heading text-lg font-bold tabular-nums text-accent-foreground">Total de la semana: {formatHoras(semana.totales.minutosAcreditables)}</p>
        </>
      )}
      <BitacoraLectura semana={semana} />
      {semana.id !== null && semana.estadoValidacion === 'ENVIADA' && <AccionesSemana key={semana.id} semanaId={semana.id} />}
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
      <h2 id="detalle-historial" className="font-heading text-xl font-bold">
        Historial por semana
      </h2>
      {semana.isPending && <p role="status">Cargando historial…</p>}
      {semana.isError && <ErrorConReintento message={messageOf(semana.error)} onRetry={() => void semana.refetch()} />}
      {semana.data && <SemanaContenido semana={semana.data} onIr={irASemana} />}
    </section>
  );
}
