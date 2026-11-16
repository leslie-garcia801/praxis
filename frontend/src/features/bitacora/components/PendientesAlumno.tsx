import { Link } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { diaMonterrey, formatDiaCorto, formatRangoSemana, lunesDeSemana } from '@/lib/tiempo';
import { useMisCorrecciones, type CorreccionConTurno } from '../../correcciones/api';
import { usePendientes, type Pendiente } from '../api';

// A rejected correction stays in the list for this many days, so the student sees the office's answer (RF-17).
const DIAS_RECHAZO_VISIBLE = 7;
const MS_DIA = 86_400_000;

const enlaceClass = 'text-primary underline underline-offset-4';

function textoPendiente(p: Pendiente): string {
  const rango = formatRangoSemana(p.semanaInicio, p.semanaFin);
  switch (p.motivo) {
    case 'RECHAZADA':
      return `Corrige la bitácora de la semana del ${rango}`;
    case 'BITACORA_PENDIENTE':
      return `Escribe la bitácora de la semana del ${rango} para enviarla`;
    case 'BITACORA_SEMANA_ACTUAL':
      return 'Escribe la bitácora de esta semana';
  }
}

// RF-17: the latest request of each shift (the API sends them newest first), when it is in review or was
// rejected recently.
function correccionesPendientes(correcciones: CorreccionConTurno[], ahora = Date.now()): CorreccionConTurno[] {
  const vistos = new Set<string>();
  return correcciones.filter((c) => {
    if (vistos.has(c.asistenciaId)) return false;
    vistos.add(c.asistenciaId);
    if (c.estado === 'PENDIENTE') return true;
    return c.estado === 'RECHAZADA' && c.resueltoEn !== null && ahora - Date.parse(c.resueltoEn) <= DIAS_RECHAZO_VISIBLE * MS_DIA;
  });
}

function CorreccionItem({ correccion }: { correccion: CorreccionConTurno }) {
  const dia = diaMonterrey(correccion.turno.entrada);
  const texto =
    correccion.estado === 'PENDIENTE'
      ? `Tu corrección del ${formatDiaCorto(dia)} está en revisión`
      : `Tu oficina rechazó la corrección del ${formatDiaCorto(dia)}`;
  return (
    <li className="flex flex-col gap-1 rounded-lg border p-3">
      <Link to={`/alumno/historial?semana=${encodeURIComponent(lunesDeSemana(dia))}`} className={enlaceClass}>
        {texto}
      </Link>
      {correccion.comentario && <p className="text-slate-800">Comentario de tu oficina: «{correccion.comentario}»</p>}
    </li>
  );
}

// RF-18 (point 5): weeks and shift corrections that need the student's attention, each linking to its week.
export function PendientesAlumno() {
  const pendientes = usePendientes();
  const correcciones = useMisCorrecciones();

  // RF-16: offline the requests stay paused; say so instead of a spinner that never ends.
  const sinRed =
    (pendientes.isPending && pendientes.fetchStatus === 'paused') ||
    (correcciones.isPending && correcciones.fetchStatus === 'paused');
  const cargando = (pendientes.isPending || correcciones.isPending) && !sinRed;
  const error = pendientes.isError || correcciones.isError;
  const semanas = pendientes.data ?? [];
  const turnos = correccionesPendientes(correcciones.data ?? []);
  const listo = pendientes.isSuccess && correcciones.isSuccess;

  return (
    <section aria-labelledby="pendientes-titulo" className="flex flex-col gap-2">
      <h2 id="pendientes-titulo" className="text-lg font-semibold">
        Pendientes
      </h2>
      {cargando && !error && <p>Cargando tus pendientes…</p>}
      {sinRed && <p className="text-slate-800">Sin conexión. Tus pendientes se mostrarán cuando vuelva la conexión.</p>}
      {error && (
        <ErrorConReintento
          message="No se pudieron cargar tus pendientes."
          onRetry={() => {
            if (pendientes.isError) void pendientes.refetch();
            if (correcciones.isError) void correcciones.refetch();
          }}
        />
      )}
      {listo && semanas.length + turnos.length === 0 && <p className="text-slate-800">No tienes pendientes</p>}
      {listo && semanas.length + turnos.length > 0 && (
        <ul aria-label="Pendientes" className="flex flex-col gap-2">
          {semanas.map((p) => (
            <li key={p.id} className="flex flex-col gap-1 rounded-lg border p-3">
              <Link to={`/alumno/historial?semana=${encodeURIComponent(p.semanaInicio)}`} className={enlaceClass}>
                {textoPendiente(p)}
              </Link>
              {p.comentario && <p className="text-slate-800">Comentario de tu supervisor: «{p.comentario}»</p>}
            </li>
          ))}
          {turnos.map((c) => (
            <CorreccionItem key={c.id} correccion={c} />
          ))}
        </ul>
      )}
    </section>
  );
}
