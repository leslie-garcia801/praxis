import { Link, useSearchParams } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { formatHoras, formatRangoSemana, hoyMonterrey, sumarDias } from '@/lib/tiempo';
import { BitacoraSemana } from '../../bitacora/components/BitacoraSemana';
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
        <h2 className="text-lg font-semibold">Semana del {formatRangoSemana(semana.inicio, semana.fin)}</h2>
        <p className="text-slate-800">{textoValidacion(semana.estadoValidacion)}</p>
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
        <p role="status" className="rounded-lg border bg-muted p-3 text-slate-800">
          No hay registros esta semana
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {semana.dias.map((dia) => (
              <DiaHistorial key={dia.fecha} dia={dia} />
            ))}
          </div>
          <p className="text-lg font-semibold">
            Total de la semana: {formatHoras(semana.totales.minutosAcreditables)}
          </p>
        </>
      )}
      <BitacoraSemana key={semana.inicio} semana={semana} />
    </>
  );
}

export function HistorialPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const historial = useHistorial(searchParams.get('semana') ?? undefined);
  const irASemana = (fecha: string) => setSearchParams({ semana: fecha });

  const sinExpediente = historial.error instanceof ApiError && historial.error.code === 'EXPEDIENTE_NO_ENCONTRADO';

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Historial</h1>
      {historial.isPending && <p>Cargando tu historial…</p>}
      {sinExpediente && (
        <p role="status" className="rounded-lg border bg-muted p-3 text-slate-800">
          No tienes un expediente. Acude a vinculación.
        </p>
      )}
      {historial.isError && !sinExpediente && (
        <ErrorConReintento message="No se pudo cargar tu historial." onRetry={() => void historial.refetch()} />
      )}
      {historial.data && <SemanaContenido semana={historial.data} onIr={irASemana} />}
      <Link to="/alumno" className="text-primary underline underline-offset-4">
        Volver al inicio
      </Link>
    </main>
  );
}
