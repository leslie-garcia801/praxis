import { ACUDE_A_TU_OFICINA } from '@/lib/oficinas';
import { Link, useSearchParams } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { esErrorDeRed, useEnLinea } from '@/lib/conexion';
import { formatHoras, formatRangoSemana, hoyMonterrey, sumarDias } from '@/lib/tiempo';
import { BitacoraSemana } from '../../bitacora/components/BitacoraSemana';
import { EtiquetaLibreta } from '../../libreta/components/EtiquetaLibreta';
import { PanelLibreta } from '../../libreta/components/PanelLibreta';
import { VARIANTE_VALIDACION } from '../varianteValidacion';
import { useHistorial, type EstadoValidacion, type SemanaHistorial } from '../api';
import { DiaHistorial } from './DiaHistorial';

const TEXTO_VALIDACION: Record<EstadoValidacion, string> = {
  BORRADOR: 'Sin enviar',
  ENVIADA: 'Enviada a tu supervisor',
  VALIDADA: 'Validada',
  RECHAZADA: 'Rechazada',
};

function textoValidacion(estado: EstadoValidacion | null): string {
  return estado ? TEXTO_VALIDACION[estado] : TEXTO_VALIDACION.BORRADOR;
}

function SemanaContenido({ semana, onIr }: { semana: SemanaHistorial; onIr: (fecha: string) => void }) {
  // The next week is disabled once the shown week reaches today (Monterrey calendar day).
  const esActual = semana.fin >= hoyMonterrey();
  const sinTurnos = semana.dias.every((dia) => dia.turnos.length === 0);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-bold">Semana del {formatRangoSemana(semana.inicio, semana.fin)}</h2>
        <p>
          <Badge variant={VARIANTE_VALIDACION[semana.estadoValidacion ?? 'BORRADOR']}>{textoValidacion(semana.estadoValidacion)}</Badge>
        </p>
        {semana.deLibreta && <EtiquetaLibreta />}
      </header>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => onIr(sumarDias(semana.inicio, -7))}>
          Semana anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={esActual}
          onClick={() => onIr(sumarDias(semana.inicio, 7))}
        >
          Semana siguiente
        </Button>
      </div>
      {sinTurnos ? (
        <p role="status" className="rounded-lg border-2 border-info-borde bg-info p-3 text-info-foreground">
          No hay registros esta semana
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {semana.dias.map((dia) => (
              <DiaHistorial key={dia.fecha} dia={dia} />
            ))}
          </div>
          <p className="rounded-lg bg-accent px-3 py-2 font-heading text-lg font-bold tabular-nums text-accent-foreground">
            Total de la semana: {formatHoras(semana.totales.minutosAcreditables)}
          </p>
        </>
      )}
      {semana.deLibreta ? <PanelLibreta semana={semana} /> : <BitacoraSemana key={semana.inicio} semana={semana} />}
    </>
  );
}

export function HistorialPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const historial = useHistorial(searchParams.get('semana') ?? undefined);
  const irASemana = (fecha: string) => setSearchParams({ semana: fecha });

  const enLinea = useEnLinea();

  const sinExpediente = historial.error instanceof ApiError && historial.error.code === 'EXPEDIENTE_NO_ENCONTRADO';
  // RF-16: no network (paused request, offline, or fetch failed): say so instead of spinning or a generic error.
  const sinRed =
    !historial.data && (historial.fetchStatus === 'paused' || !enLinea || (historial.isError && esErrorDeRed(historial.error)));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="text-[1.75rem] font-extrabold">Historial</h1>
      {historial.isPending && !sinRed && <p>Cargando tu historial…</p>}
      {sinRed && (
        <ErrorConReintento
          message="Sin conexión. Conéctate para ver tu historial."
          onRetry={() => void historial.refetch()}
        />
      )}
      {sinExpediente && (
        <p role="status" className="rounded-lg border-2 border-info-borde bg-info p-3 text-info-foreground">
          No tienes un expediente. {ACUDE_A_TU_OFICINA}
        </p>
      )}
      {historial.isError && !sinExpediente && !sinRed && (
        <ErrorConReintento message="No se pudo cargar tu historial." onRetry={() => void historial.refetch()} />
      )}
      {historial.data && <SemanaContenido semana={historial.data} onIr={irASemana} />}
      <Link to="/alumno" className="text-primary underline underline-offset-4">
        Volver al inicio
      </Link>
    </main>
  );
}
