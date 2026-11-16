import { useEffect, useState } from 'react';
import { ACUDE_A_TU_OFICINA, NOMBRE_OFICINA, acudeALaOficina } from '@/lib/oficinas';
import { Link, useLocation, useNavigate } from 'react-router';
import { AvisoTemporal } from '@/components/AvisoTemporal';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PendientesAlumno } from '@/features/bitacora/components/PendientesAlumno';
import { useMe, type Me } from '@/features/auth/api';
import { useExpediente } from '@/features/expediente/api';
import { nombreSupervisor } from '@/features/expediente/nombreSupervisor';
import { AvisoSinConexion, EstadoRegistrosPendientes, RegistrosRechazados } from '@/features/escaneo/components/RegistrosPendientes';
import { DescargarReporte } from '@/features/reporte/components/DescargarReporte';
import { esErrorDeRed, useEnLinea } from '@/lib/conexion';
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

// Where the student does the work and who validates it: institution and supervisor, plus the full expediente.
function DatosExpediente({ expedienteId }: { expedienteId: string }) {
  const detalle = useExpediente(expedienteId);
  const { institucion, supervisor } = detalle.data ?? {};
  return (
    <section aria-label="Mi expediente" className="flex flex-col gap-2 rounded-lg border p-3">
      {detalle.data && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-slate-800">
          <dt>Institución</dt>
          <dd className="text-right font-medium">{institucion?.nombre ?? 'Sin asignar'}</dd>
          <dt>Supervisor</dt>
          <dd className="text-right font-medium">{supervisor ? nombreSupervisor(supervisor) : 'Sin asignar'}</dd>
        </dl>
      )}
      <Link to="/alumno/expediente" className={linkClass}>
        Mi expediente
      </Link>
    </section>
  );
}

function AvanceContenido({ expediente }: { expediente: Expediente }) {
  const suspendido = expediente.estado === 'SUSPENDIDO';
  const avance = useAvance(expediente.id);

  return (
    <>
      {suspendido && (
        <Aviso>{`Tu expediente está suspendido; no puedes registrar asistencia. ${acudeALaOficina(expediente.tipo)}`}</Aviso>
      )}
      {avance.isPending && avance.fetchStatus === 'paused' && (
        <p>Sin conexión. Tu avance se mostrará cuando vuelva la conexión.</p>
      )}
      {avance.isPending && avance.fetchStatus !== 'paused' && <p>Cargando tu avance…</p>}
      {avance.isError && esErrorDeRed(avance.error) && !avance.data && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-destructive">Sin conexión. No se pudo cargar tu avance.</p>
          <Button variant="outline" onClick={() => void avance.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {avance.isError && !esErrorDeRed(avance.error) && (
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
      <DatosExpediente expedienteId={expediente.id} />
      <RegistrosRechazados />
      <PendientesAlumno />
      <DescargarReporte expedienteId={expediente.id} />
    </>
  );
}

// RF-10: PENDIENTE either lacks data the student must fill in, or is complete and waits for the office.
function PendienteContenido({ expediente }: { expediente: Expediente }) {
  const detalle = useExpediente(expediente.id);
  if (detalle.data && detalle.data.faltantes.length === 0) {
    return (
      <>
        <Aviso>{`Tu expediente está pendiente de confirmar. La ${NOMBRE_OFICINA[expediente.tipo]} lo revisará y podrás registrar cuando lo confirme.`}</Aviso>
        <Link to="/alumno/expediente" className={linkClass}>
          Revisar mi expediente
        </Link>
      </>
    );
  }
  return (
    <>
      <Aviso>Completa tu expediente para empezar a registrar</Aviso>
      <Button asChild className="h-12 w-full">
        <Link to="/alumno/expediente">Completar expediente</Link>
      </Button>
    </>
  );
}

function Contenido({ expediente }: { expediente: Expediente | null }) {
  if (!expediente) return <Aviso>{`No tienes un expediente activo. ${ACUDE_A_TU_OFICINA}`}</Aviso>;
  if (expediente.estado === 'PENDIENTE') return <PendienteContenido expediente={expediente} />;
  return <AvanceContenido expediente={expediente} />;
}

// A message handed over by the previous screen (navigation state). It is shown once, not again on reload.
function useAvisoDeNavegacion(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [aviso] = useState(() => (location.state as { aviso?: string } | null)?.aviso ?? null);
  const hayAviso = Boolean((location.state as { aviso?: string } | null)?.aviso);

  useEffect(() => {
    if (hayAviso) void navigate(location.pathname, { replace: true, state: null });
  }, [hayAviso, location.pathname, navigate]);

  return aviso;
}

// RF-16: the session could not be read (app opened offline with a known student). The server decides
// whether the expediente allows registering, so the button stays; the data that needs the network does not show.
function ContenidoSinConexion() {
  return (
    <>
      <RegistrarButton habilitado />
      <Link to="/alumno/historial" className={linkClass}>
        Historial
      </Link>
      <RegistrosRechazados />
    </>
  );
}

export function InicioAlumnoPage() {
  const me = useMe();
  const enLinea = useEnLinea();
  const aviso = useAvisoDeNavegacion();
  const sinSesion = me.data === undefined;
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Mi avance</h1>
      {aviso && <AvisoTemporal>{aviso}</AvisoTemporal>}
      {(!enLinea || sinSesion) && <AvisoSinConexion />}
      <EstadoRegistrosPendientes />
      {me.data && <Contenido expediente={me.data.expedienteActivo} />}
      {sinSesion && <ContenidoSinConexion />}
    </main>
  );
}
