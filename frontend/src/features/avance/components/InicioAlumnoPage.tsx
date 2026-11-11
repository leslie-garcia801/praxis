import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useMe, type Me } from '@/features/auth/api';
import { esHoy, formatFecha, formatHora, formatHoras } from '@/lib/tiempo';
import { useAvance, type Avance } from '../api';

type Expediente = NonNullable<Me['expedienteActivo']>;

const linkClass = 'text-primary underline underline-offset-4';

function Aviso({ children }: { children: string }) {
  return (
    <p role="status" className="rounded-lg border bg-muted p-3 text-slate-800">
      {children}
    </p>
  );
}

function RegistrarButton({ habilitado }: { habilitado: boolean }) {
  const className = 'h-14 w-full text-lg';
  if (!habilitado) {
    return (
      <Button className={className} disabled>
        Registrar
      </Button>
    );
  }
  return (
    <Button asChild className={className}>
      <Link to="/alumno/registrar">Registrar</Link>
    </Button>
  );
}

function textoFechaEstimada(fecha: Avance['fechaEstimada']): string {
  switch (fecha.tipo) {
    case 'ESTIMADA':
      return `Terminarías aproximadamente el ${formatFecha(fecha.fecha)}`;
    case 'COMPLETADO':
      return 'Ya registraste las horas de tu meta; falta que se validen';
    case 'SIN_DATOS':
      return 'Aún sin datos suficientes';
  }
}

function textoTurno(turnoAbierto: Avance['turnoAbierto']): string {
  if (!turnoAbierto) return 'Sin turno abierto';
  const desde = `Turno abierto desde las ${formatHora(turnoAbierto.entrada)}`;
  return esHoy(turnoAbierto.entrada) ? desde : `${desde} del ${formatFecha(turnoAbierto.entrada)}`;
}

function AvanceContenido({ expediente }: { expediente: Expediente }) {
  const suspendido = expediente.estado === 'SUSPENDIDO';
  const avance = useAvance(expediente.id);

  return (
    <>
      {suspendido && (
        <Aviso>Tu expediente está suspendido; no puedes registrar asistencia. Acude a vinculación.</Aviso>
      )}
      {avance.isPending && <p>Cargando tu avance…</p>}
      {avance.isError && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-destructive">No se pudo cargar tu avance.</p>
          <Button variant="outline" onClick={() => void avance.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {avance.data && (
        <>
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-slate-700">Validado</span>
              <span className="text-2xl font-bold">{avance.data.porcentaje} %</span>
            </div>
            <Progress value={avance.data.porcentaje} aria-label="Avance validado" />
          </section>

          <section className="flex flex-col gap-1">
            <p className="text-lg font-semibold">
              {formatHoras(avance.data.minutosValidados)} de {formatHoras(avance.data.metaMinutos)}
            </p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-slate-800">
              <dt>Validadas por tu supervisor</dt>
              <dd className="text-right font-medium">{formatHoras(avance.data.minutosValidados)}</dd>
              <dt>Registradas sin validar</dt>
              <dd className="text-right font-medium">{formatHoras(avance.data.minutosRegistrados)}</dd>
              <dt>Faltan</dt>
              <dd className="text-right font-medium">{formatHoras(avance.data.minutosFaltantes)}</dd>
            </dl>
          </section>

          <p>{textoFechaEstimada(avance.data.fechaEstimada)}</p>

          <section className="flex flex-col gap-3">
            <p className="font-medium">{textoTurno(avance.data.turnoAbierto)}</p>
          </section>
        </>
      )}
      <RegistrarButton habilitado={!suspendido} />
      <Link to="/alumno/historial" className={linkClass}>
        Historial
      </Link>
    </>
  );
}

function Contenido({ expediente }: { expediente: Expediente | null }) {
  if (!expediente) return <Aviso>No tienes un expediente activo. Acude a vinculación.</Aviso>;
  if (expediente.estado === 'PENDIENTE') {
    return (
      <>
        <Aviso>Completa tu expediente para empezar a registrar</Aviso>
        <Button asChild className="h-12 w-full">
          <Link to="/alumno/expediente">Completar expediente</Link>
        </Button>
      </>
    );
  }
  return <AvanceContenido expediente={expediente} />;
}

export function InicioAlumnoPage() {
  const me = useMe();
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Mi avance</h1>
      {me.data && <Contenido expediente={me.data.expedienteActivo} />}
    </main>
  );
}
