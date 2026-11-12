import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { Progress } from '@/components/ui/progress';
import { formatFecha, formatHoras } from '@/lib/tiempo';
import { useAvance } from '../../avance/api';
import type { EstadoExpediente } from '../../expediente/api';
import { messageOf } from '../../importaciones/archivo';
import { useExpedienteDetalle, type ExpedienteDetalle } from '../api';
import { RestablecerContrasenaButton } from './RestablecerContrasenaButton';

const ESTADO: Record<EstadoExpediente, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  SUSPENDIDO: 'Suspendido',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
};
const TIPO = { SERVICIO_SOCIAL: 'Servicio social', PRACTICAS: 'Prácticas profesionales' } as const;
const TURNO = { MATUTINO: 'Matutino', VESPERTINO: 'Vespertino' } as const;

const nombreCompleto = (p: { nombre: string; apellidoPaterno: string; apellidoMaterno: string | null }) =>
  [p.nombre, p.apellidoPaterno, p.apellidoMaterno].filter(Boolean).join(' ');

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-slate-700">{etiqueta}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function AvanceExpediente({ expedienteId }: { expedienteId: string }) {
  const avance = useAvance(expedienteId);
  if (avance.isPending) return <p>Cargando avance…</p>;
  if (avance.isError) return <ErrorConReintento message={messageOf(avance.error)} onRetry={() => void avance.refetch()} />;

  const a = avance.data;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span>
          {formatHoras(a.minutosValidados)} validadas de {formatHoras(a.metaMinutos)}
        </span>
        <span className="text-xl font-bold">{a.porcentaje} %</span>
      </div>
      <Progress value={a.porcentaje} aria-label="Avance validado" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <Dato etiqueta="Registradas">{formatHoras(a.minutosRegistrados)}</Dato>
        <Dato etiqueta="Faltan">{formatHoras(a.minutosFaltantes)}</Dato>
        <Dato etiqueta="Fecha estimada">
          {a.fechaEstimada.tipo === 'ESTIMADA'
            ? formatFecha(a.fechaEstimada.fecha)
            : a.fechaEstimada.tipo === 'COMPLETADO'
              ? 'Meta cumplida'
              : 'Sin datos suficientes'}
        </Dato>
      </dl>
    </div>
  );
}

function Contenido({ e }: { e: ExpedienteDetalle }) {
  const { alumno, supervisor } = e;
  const nombre = nombreCompleto(alumno);
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{nombre}</h1>
        {alumno.matricula && <p className="font-mono text-slate-700">{alumno.matricula}</p>}
      </header>

      <Seccion titulo="Alumno">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <Dato etiqueta="Carrera">{alumno.carrera}</Dato>
          <Dato etiqueta="Grupo">
            Semestre {alumno.semestre} · Grupo {alumno.grupo} · {TURNO[alumno.turno]}
          </Dato>
        </dl>
        <RestablecerContrasenaButton alumnoId={alumno.id} nombre={nombre} />
      </Seccion>

      <Seccion titulo="Expediente">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <Dato etiqueta="Programa">{TIPO[e.tipo]}</Dato>
          <Dato etiqueta="Estado">{ESTADO[e.estado]}</Dato>
          <Dato etiqueta="Institución">{e.institucion?.nombre ?? 'Sin institución'}</Dato>
          {e.departamento && <Dato etiqueta="Departamento">{e.departamento}</Dato>}
          <Dato etiqueta="Supervisor">
            {supervisor ? (
              <>
                {nombreCompleto(supervisor)}
                {supervisor.correo && <span className="block text-slate-700">{supervisor.correo}</span>}
                {!supervisor.confirmado && <span className="block text-slate-700">Por confirmar</span>}
              </>
            ) : (
              'Sin supervisor'
            )}
          </Dato>
          {e.fechaInicio && <Dato etiqueta="Inicio">{formatFecha(e.fechaInicio)}</Dato>}
        </dl>
      </Seccion>

      <Seccion titulo="Avance">
        <AvanceExpediente expedienteId={e.id} />
      </Seccion>
    </>
  );
}

// Task 0030 (first part): student detail opened from the panel, with the RF-04 password reset.
export function DetalleAlumnoPage() {
  const { id = '' } = useParams();
  const expediente = useExpedienteDetalle(id);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <Link to="/vinculacion" className="self-start text-sm underline">
        Volver al panel
      </Link>
      {expediente.isPending && <p>Cargando expediente…</p>}
      {expediente.isError && (
        <ErrorConReintento message={messageOf(expediente.error)} onRetry={() => void expediente.refetch()} />
      )}
      {expediente.data && <Contenido e={expediente.data} />}
    </main>
  );
}
