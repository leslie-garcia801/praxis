import { useEffect, useState } from 'react';
import { cn } from 'cn';
import { ACUDE_A_TU_OFICINA, NOMBRE_OFICINA, acudeALaOficina } from '@/lib/oficinas';
import { History, NotebookPen, QrCode, ScanLine, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { AvisoTemporal } from '@/components/AvisoTemporal';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeccionCard } from '@/components/SeccionCard';
import { Progress } from '@/components/ui/progress';
import { PendientesAlumno } from '@/features/bitacora/components/PendientesAlumno';
import { useMe, type Me } from '@/features/auth/api';
import { useExpediente } from '@/features/expediente/api';
import { nombreSupervisor } from '@/features/expediente/nombreSupervisor';
import { AvisoSinConexion, EstadoRegistrosPendientes, RegistrosRechazados } from '@/features/escaneo/components/RegistrosPendientes';
import { RecordatoriosCard } from '@/features/recordatorios/components/RecordatoriosCard';
import { DescargarReporte } from '@/features/reporte/components/DescargarReporte';
import { esErrorDeRed, useEnLinea } from '@/lib/conexion';
import { esHoy, formatFecha, formatHora, formatHoras } from '@/lib/tiempo';
import { useAvance, type Avance } from '../api';

type Expediente = NonNullable<Me['expedienteActivo']>;

const linkClass = 'text-primary underline underline-offset-4';

// Secondary destinations: a full-width row, at least 44 px tall, with a decorative icon.
const filaClass = cn(buttonVariants({ variant: 'outline' }), 'h-12 w-full justify-start gap-3 text-base');

const avisoBase = 'rounded-lg border-2 p-3';
const avisoInfoClass = `${avisoBase} border-info-borde bg-info text-info-foreground`;
const avisoAvisoClass = `${avisoBase} border-aviso-borde bg-aviso text-aviso-foreground`;

function Aviso({ children }: { children: string }) {
  return (
    <p role="status" className={avisoInfoClass}>
      {children}
    </p>
  );
}

function RegistrarButton({ habilitado }: { habilitado: boolean }) {
  const className = 'h-16 w-full gap-3 text-xl font-bold shadow-md [&_svg:not([class*=size-])]:size-6';
  if (!habilitado) {
    return (
      <Button className={className} disabled>
        <QrCode aria-hidden="true" />
        Registrar
      </Button>
    );
  }
  return (
    <Button asChild className={className}>
      <Link to="/alumno/registrar">
        <ScanLine aria-hidden="true" />
        Registrar
      </Link>
    </Button>
  );
}

// RF-28: the server flags a shift open for 6 h or more on the same day; there is still time to register the exit.
function AvisoOlvidoSalida() {
  return (
    <section role="alert" className={`flex flex-col gap-2 ${avisoAvisoClass}`}>
      <p className="text-lg font-semibold">¿Olvidaste registrar tu salida?</p>
      <Button asChild className="w-full">
        <Link to="/alumno/registrar">Registrar salida</Link>
      </Button>
    </section>
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
    <SeccionCard aria-label="Mi expediente">
      {detalle.data && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-foreground">
          <dt>Institución</dt>
          <dd className="text-right font-medium">{institucion?.nombre ?? 'Sin asignar'}</dd>
          <dt>Supervisor</dt>
          <dd className="text-right font-medium">{supervisor ? nombreSupervisor(supervisor) : 'Sin asignar'}</dd>
        </dl>
      )}
      <Link to="/alumno/expediente" className={filaClass}>
        <UserRound aria-hidden="true" className="size-5 text-primary" />
        Mi expediente
      </Link>
    </SeccionCard>
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
        <p className={avisoInfoClass}>Sin conexión. Tu avance se mostrará cuando vuelva la conexión.</p>
      )}
      {avance.isPending && avance.fetchStatus !== 'paused' && <p>Cargando tu avance…</p>}
      {avance.isError && esErrorDeRed(avance.error) && !avance.data && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border-2 border-destructive/60 bg-destructive/10 p-3">
          <p className="font-medium text-destructive">Sin conexión. No se pudo cargar tu avance.</p>
          <Button variant="outline" onClick={() => void avance.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {avance.isError && !esErrorDeRed(avance.error) && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border-2 border-destructive/60 bg-destructive/10 p-3">
          <p className="font-medium text-destructive">No se pudo cargar tu avance.</p>
          <Button variant="outline" onClick={() => void avance.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {avance.data && (
        <>
          {avance.data.turnoAbierto?.recordarSalida && <AvisoOlvidoSalida />}
          <Card>
            <CardContent className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-muted-foreground">Validado</span>
                  <span className="font-heading text-5xl font-extrabold tabular-nums text-primary">{avance.data.porcentaje} %</span>
                </div>
                <Progress value={avance.data.porcentaje} aria-label="Avance validado" className="h-4" />
              </section>

              <section className="flex flex-col gap-3">
                <p className="text-lg font-semibold tabular-nums">
                  {formatHoras(avance.data.minutosValidados)} de {formatHoras(avance.data.metaMinutos)}
                </p>
                <dl className="grid grid-cols-3 gap-2 text-foreground">
                  <div className="flex flex-col gap-1 rounded-lg border border-exito-borde/40 bg-exito p-2 text-exito-foreground">
                    <dt className="text-xs leading-tight">Validadas por tu supervisor</dt>
                    <dd className="font-heading text-lg font-extrabold tabular-nums">{formatHoras(avance.data.minutosValidados)}</dd>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border border-info-borde/40 bg-info p-2 text-info-foreground">
                    <dt className="text-xs leading-tight">Registradas sin validar</dt>
                    <dd className="font-heading text-lg font-extrabold tabular-nums">{formatHoras(avance.data.minutosRegistrados)}</dd>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted p-2">
                    <dt className="text-xs leading-tight">Faltan</dt>
                    <dd className="font-heading text-lg font-extrabold tabular-nums">{formatHoras(avance.data.minutosFaltantes)}</dd>
                  </div>
                </dl>
              </section>

              <p className="text-foreground">{textoFechaEstimada(avance.data.fechaEstimada)}</p>

              <section className="flex flex-col gap-3 border-t border-border pt-3">
                <p className="font-medium">{textoTurno(avance.data.turnoAbierto)}</p>
              </section>
            </CardContent>
          </Card>
        </>
      )}
      <RegistrarButton habilitado={!suspendido} />
      <Link to="/alumno/historial" className={filaClass}>
        <History aria-hidden="true" className="size-5 text-primary" />
        Historial
      </Link>
      {expediente.estado === 'EN_PROCESO' && (
        <Link to="/alumno/libreta" className={filaClass}>
          <NotebookPen aria-hidden="true" className="size-5 text-primary" />
          Agregar horas
        </Link>
      )}
      <DatosExpediente expedienteId={expediente.id} />
      <RegistrosRechazados />
      <PendientesAlumno />
      <RecordatoriosCard />
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
      <Button asChild className="w-full">
        <Link to="/alumno/expediente">Completar expediente</Link>
      </Button>
    </>
  );
}

const NOMBRE_TERMINADO = { SERVICIO_SOCIAL: 'tu servicio social', PRACTICAS: 'tus prácticas profesionales' } as const;

// RF-18: nothing is running, but the student has finished a program (the office finalized it).
function textoTerminaste(programas: Me['programasFinalizados']): string {
  return `Terminaste ${programas.map((p) => NOMBRE_TERMINADO[p]).join(' y ')}.`;
}

function Contenido({ expediente, programasFinalizados }: { expediente: Expediente | null; programasFinalizados: Me['programasFinalizados'] }) {
  if (!expediente && programasFinalizados.length > 0) return <Aviso>{textoTerminaste(programasFinalizados)}</Aviso>;
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
      <Link to="/alumno/historial" className={filaClass}>
        <History aria-hidden="true" className="size-5 text-primary" />
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
      <h1 className="text-[1.75rem] font-extrabold">Mi avance</h1>
      {aviso && <AvisoTemporal>{aviso}</AvisoTemporal>}
      {(!enLinea || sinSesion) && <AvisoSinConexion />}
      <EstadoRegistrosPendientes />
      {me.data && <Contenido expediente={me.data.expedienteActivo} programasFinalizados={me.data.programasFinalizados} />}
      {sinSesion && <ContenidoSinConexion />}
    </main>
  );
}
