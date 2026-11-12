import { ErrorConReintento } from '@/components/ErrorConReintento';
import { formatFecha, formatHora } from '@/lib/tiempo';
import { messageOf } from '../../importaciones/archivo';
import { useAuditoria, type EntradaAuditoria } from '../api';

const TEXTO_ACCION: Record<string, string> = {
  EDITAR_EXPEDIENTE: 'Datos del expediente editados',
  CONFIRMAR_EXPEDIENTE: 'Expediente confirmado',
  SUSPENDER_EXPEDIENTE: 'Expediente suspendido',
  REACTIVAR_EXPEDIENTE: 'Expediente reactivado',
  CANCELAR_EXPEDIENTE: 'Baja del expediente',
  TRANSFERIR_EXPEDIENTE: 'Expediente transferido',
  ASIGNAR_PROGRAMA: 'Programa asignado',
  ENVIAR_SEMANA: 'Semana enviada por el alumno',
  ENVIAR_SEMANA_AUTOMATICO: 'Semana enviada automáticamente',
  VALIDAR_SEMANA: 'Semana validada',
  RECHAZAR_SEMANA: 'Semana rechazada',
};

const TEXTO_ENTIDAD: Record<string, string> = { Expediente: 'Expediente', SemanaBitacora: 'Semana' };

const TEXTO_CAMPO: Record<string, string> = {
  estado: 'Estado',
  motivo: 'Motivo',
  comentario: 'Comentario',
  departamento: 'Departamento',
  fechaInicio: 'Fecha de inicio',
  fechaTermino: 'Fecha de término',
  horaEntrada: 'Hora de entrada',
  horaSalida: 'Hora de salida',
  diasPactados: 'Días pactados',
  programa: 'Programa',
  subprograma: 'Subprograma',
  enviadaEn: 'Enviada',
};

const TEXTO_ESTADO: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  SUSPENDIDO: 'Suspendido',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
  BORRADOR: 'Sin enviar',
  ENVIADA: 'Enviada',
  VALIDADA: 'Validada',
  RECHAZADA: 'Rechazada',
};

function valor(clave: string, v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (clave === 'estado' && typeof v === 'string') return TEXTO_ESTADO[v] ?? v;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

// Compact "campo: antes → después" lines for the fields that changed (or that the entry only sets).
function cambios(antes: EntradaAuditoria['antes'], despues: EntradaAuditoria['despues']): string[] {
  const claves = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})])];
  return claves
    .filter((c) => JSON.stringify(antes?.[c]) !== JSON.stringify(despues?.[c]))
    .map((c) => `${TEXTO_CAMPO[c] ?? c}: ${valor(c, antes?.[c])} → ${valor(c, despues?.[c])}`);
}

function Fila({ entrada }: { entrada: EntradaAuditoria }) {
  const lineas = cambios(entrada.antes, entrada.despues);
  return (
    <tr className="border-b border-border align-top">
      <td className="py-2 pr-3">
        <div>{formatFecha(entrada.fecha)}</div>
        <div className="text-xs text-slate-700">{formatHora(entrada.fecha)}</div>
      </td>
      <td className="py-2 pr-3">{entrada.usuario}</td>
      <td className="py-2 pr-3">{TEXTO_ACCION[entrada.accion] ?? entrada.accion}</td>
      <td className="py-2 pr-3">{TEXTO_ENTIDAD[entrada.entidad] ?? entrada.entidad}</td>
      <td className="py-2">
        {lineas.length === 0 ? (
          '—'
        ) : (
          <ul className="flex flex-col gap-0.5">
            {lineas.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

// RF-29: who did what on this case file and its weeks. Read-only.
export function AuditoriaExpediente({ expedienteId }: { expedienteId: string }) {
  const auditoria = useAuditoria(expedienteId);

  return (
    <section aria-labelledby="detalle-auditoria" className="flex flex-col gap-3">
      <h2 id="detalle-auditoria" className="text-xl font-semibold">
        Auditoría
      </h2>
      {auditoria.isPending && <p role="status">Cargando auditoría…</p>}
      {auditoria.isError && (
        <ErrorConReintento message={messageOf(auditoria.error)} onRetry={() => void auditoria.refetch()} />
      )}
      {auditoria.data &&
        (auditoria.data.entradas.length === 0 ? (
          <p role="status" className="rounded-lg border bg-muted p-3 text-slate-800">
            Aún no hay movimientos registrados
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="py-2 pr-3">Fecha</th>
                    <th scope="col" className="py-2 pr-3">Usuario</th>
                    <th scope="col" className="py-2 pr-3">Acción</th>
                    <th scope="col" className="py-2 pr-3">Entidad</th>
                    <th scope="col" className="py-2">Cambio</th>
                  </tr>
                </thead>
                <tbody>
                  {auditoria.data.entradas.map((entrada) => (
                    <Fila key={entrada.id} entrada={entrada} />
                  ))}
                </tbody>
              </table>
            </div>
            {auditoria.data.truncado && (
              <p className="text-sm text-slate-700">Se muestran los {auditoria.data.limite} movimientos más recientes.</p>
            )}
          </>
        ))}
    </section>
  );
}
