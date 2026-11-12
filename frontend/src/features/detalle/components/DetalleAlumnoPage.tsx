import { Link, useParams } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { Progress } from '@/components/ui/progress';
import { ApiError } from '@/lib/api';
import { formatFecha, formatHoras } from '@/lib/tiempo';
import { useAvance, type Avance } from '../../avance/api';
import { messageOf } from '../../importaciones/archivo';
import { nombreSupervisor } from '../../expediente/nombreSupervisor';
import { DIAS } from '../../expediente/schemas';
import { DescargarReporte } from '../../reporte/components/DescargarReporte';
import { useExpedienteDetalle, type ExpedienteDetalle } from '../api';
import { AuditoriaExpediente } from './AuditoriaExpediente';
import { HistorialSemanas } from './HistorialSemanas';

const TEXTO_ESTADO = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  SUSPENDIDO: 'Suspendido',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
} as const;

const TEXTO_TIPO = { SERVICIO_SOCIAL: 'Servicio social', PRACTICAS: 'Prácticas profesionales' } as const;
const TEXTO_TURNO = { MATUTINO: 'Matutino', VESPERTINO: 'Vespertino' } as const;

const linkClass = 'text-primary underline underline-offset-4';

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate-700">{etiqueta}</dt>
      <dd className="font-medium">{children || 'Sin dato'}</dd>
    </>
  );
}

function Encabezado({ expediente }: { expediente: ExpedienteDetalle }) {
  const { alumno } = expediente;
  const nombre = [alumno.nombre, alumno.apellidoPaterno, alumno.apellidoMaterno].filter(Boolean).join(' ');
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">Detalle del alumno</h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-xl font-semibold">{nombre}</p>
        <span className="rounded-md border px-2 py-0.5 text-sm font-medium">{TEXTO_ESTADO[expediente.estado]}</span>
      </div>
      <p className="text-slate-800">
        {alumno.matricula ?? 'Sin matrícula'} · {TEXTO_TIPO[expediente.tipo]}
      </p>
      <p className="text-slate-800">
        {alumno.carrera} · Semestre {alumno.semestre} · Grupo {alumno.grupo} · {TEXTO_TURNO[alumno.turno]}
      </p>
      {/* Task 0031: the office actions (estado, transferir, confirmar, validar por el supervisor) go here. */}
    </header>
  );
}

function DatosExpediente({ expediente }: { expediente: ExpedienteDetalle }) {
  const practicas = expediente.tipo === 'PRACTICAS';
  const dias = DIAS.filter((d) => expediente.diasPactados.includes(d.valor)).map((d) => d.nombre);
  const { supervisor } = expediente;
  const contacto = supervisor ? [supervisor.correo, supervisor.telefono && `Tel. ${supervisor.telefono}${supervisor.extension ? ` ext. ${supervisor.extension}` : ''}`].filter(Boolean) : [];

  return (
    <section aria-labelledby="detalle-expediente" className="flex flex-col gap-3">
      <h2 id="detalle-expediente" className="text-xl font-semibold">
        Expediente
      </h2>
      <dl className="grid max-w-2xl grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[14rem_1fr]">
        <Dato etiqueta="Institución">{expediente.institucion?.nombre}</Dato>
        <Dato etiqueta="Departamento">{expediente.departamento}</Dato>
        <Dato etiqueta="Supervisor">{supervisor && nombreSupervisor(supervisor)}</Dato>
        <Dato etiqueta="Contacto del supervisor">{contacto.join(' · ')}</Dato>
        <Dato etiqueta="Fecha de inicio">{expediente.fechaInicio && formatFecha(expediente.fechaInicio)}</Dato>
        {practicas ? (
          <>
            <Dato etiqueta="Fecha de término">{expediente.fechaTermino && formatFecha(expediente.fechaTermino)}</Dato>
            <Dato etiqueta="Días pactados">{dias.join(', ')}</Dato>
            <Dato etiqueta="Horario">
              {expediente.horaEntrada && expediente.horaSalida && `${expediente.horaEntrada} a ${expediente.horaSalida}`}
            </Dato>
          </>
        ) : (
          <>
            <Dato etiqueta="Programa de servicio">{expediente.programa}</Dato>
            <Dato etiqueta="Subprograma">{expediente.subprograma}</Dato>
          </>
        )}
        <Dato etiqueta="Meta">{formatHoras(expediente.metaHoras * 60)}</Dato>
      </dl>
    </section>
  );
}

function textoFechaEstimada(fecha: Avance['fechaEstimada']): string {
  switch (fecha.tipo) {
    case 'ESTIMADA':
      return `Terminaría aproximadamente el ${formatFecha(fecha.fecha)}`;
    case 'COMPLETADO':
      return 'Ya registró las horas de la meta; falta que se validen';
    case 'SIN_DATOS':
      return 'Aún sin datos suficientes';
  }
}

function AvanceAlumno({ expedienteId }: { expedienteId: string }) {
  const avance = useAvance(expedienteId);
  return (
    <section aria-labelledby="detalle-avance" className="flex flex-col gap-3">
      <h2 id="detalle-avance" className="text-xl font-semibold">
        Avance
      </h2>
      {avance.isPending && <p role="status">Cargando avance…</p>}
      {avance.isError && <ErrorConReintento message={messageOf(avance.error)} onRetry={() => void avance.refetch()} />}
      {avance.data && (
        <div className="flex max-w-md flex-col gap-2">
          <p className="text-lg font-semibold">
            {formatHoras(avance.data.minutosValidados)} validadas de {formatHoras(avance.data.metaMinutos)} ({avance.data.porcentaje} %)
          </p>
          <Progress value={avance.data.porcentaje} aria-label="Avance validado" />
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-slate-800">
            <dt>Registradas sin validar</dt>
            <dd className="text-right font-medium">{formatHoras(avance.data.minutosRegistrados)}</dd>
            <dt>Faltan</dt>
            <dd className="text-right font-medium">{formatHoras(avance.data.minutosFaltantes)}</dd>
          </dl>
          <p>{textoFechaEstimada(avance.data.fechaEstimada)}</p>
        </div>
      )}
    </section>
  );
}

// RF-25, RF-29, RN-03b: read-only detail of one case file for the office.
export function DetalleAlumnoPage() {
  const { id = '' } = useParams();
  const expediente = useExpedienteDetalle(id);

  const sinPermiso = expediente.error instanceof ApiError && (expediente.error.status === 404 || expediente.error.status === 403);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6">
      <Link to="/vinculacion" className={linkClass}>
        Volver al panel
      </Link>
      {expediente.isPending && <p role="status">Cargando expediente…</p>}
      {expediente.isError &&
        (sinPermiso ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
            {messageOf(expediente.error)}
          </p>
        ) : (
          <ErrorConReintento message={messageOf(expediente.error)} onRetry={() => void expediente.refetch()} />
        ))}
      {expediente.data && (
        <>
          <Encabezado expediente={expediente.data} />
          <DatosExpediente expediente={expediente.data} />
          <AvanceAlumno expedienteId={id} />
          <HistorialSemanas expedienteId={id} />
          <section aria-labelledby="detalle-reporte" className="flex flex-col gap-3">
            <h2 id="detalle-reporte" className="text-xl font-semibold">
              Reporte
            </h2>
            <DescargarReporte expedienteId={id} />
          </section>
          <AuditoriaExpediente expedienteId={id} />
        </>
      )}
    </main>
  );
}
