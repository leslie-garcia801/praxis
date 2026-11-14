import { NOMBRE_OFICINA } from '@/lib/oficinas';
import { formatFecha } from '@/lib/tiempo';
import type { Expediente } from '../api';
import { DIAS } from '../schemas';
import { nombreSupervisor } from '../nombreSupervisor';

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <>
      <dt className="text-slate-700">{etiqueta}</dt>
      <dd className="font-medium">{valor || 'Sin dato'}</dd>
    </>
  );
}

// Read-only view once the expediente is no longer PENDIENTE (RF-10: only the office changes it).
export function ResumenExpediente({ expediente }: { expediente: Expediente }) {
  const practicas = expediente.tipo === 'PRACTICAS';
  const dias = DIAS.filter((d) => expediente.diasPactados.includes(d.valor)).map((d) => d.nombre);
  const aviso =
    expediente.estado === 'SUSPENDIDO'
      ? `Tu expediente está suspendido; para cambios acude a la ${NOMBRE_OFICINA[expediente.tipo]}`
      : `Tu expediente ya fue confirmado; para cambios acude a la ${NOMBRE_OFICINA[expediente.tipo]}`;

  return (
    <>
      <p role="status" className="rounded-lg border bg-muted p-3 text-slate-800">
        {aviso}
      </p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1">
        <Fila etiqueta="Programa" valor={practicas ? 'Prácticas profesionales' : 'Servicio social'} />
        <Fila etiqueta="Institución" valor={expediente.institucion?.nombre} />
        <Fila etiqueta="Supervisor" valor={expediente.supervisor && nombreSupervisor(expediente.supervisor)} />
        <Fila etiqueta="Departamento" valor={expediente.departamento} />
        <Fila etiqueta="Fecha de inicio" valor={expediente.fechaInicio && formatFecha(expediente.fechaInicio)} />
        {practicas ? (
          <>
            <Fila etiqueta="Fecha de término" valor={expediente.fechaTermino && formatFecha(expediente.fechaTermino)} />
            <Fila etiqueta="Días pactados" valor={dias.join(', ')} />
            <Fila etiqueta="Hora de entrada" valor={expediente.horaEntrada} />
            <Fila etiqueta="Hora de salida" valor={expediente.horaSalida} />
          </>
        ) : (
          <>
            <Fila etiqueta="Programa de servicio" valor={expediente.programa} />
            <Fila etiqueta="Subprograma" valor={expediente.subprograma} />
          </>
        )}
      </dl>
    </>
  );
}
