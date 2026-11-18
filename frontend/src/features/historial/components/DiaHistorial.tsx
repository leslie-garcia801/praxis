import { SeccionCard } from '@/components/SeccionCard';
import { TOPE_DIARIO_TEXTO } from '@/lib/reglas';
import { formatDiaCorto, formatHoras } from '@/lib/tiempo';
import { EtiquetaLibreta } from '../../libreta/components/EtiquetaLibreta';
import { CorreccionTurno, type VistaHistorial } from '../../correcciones/components/CorreccionTurno';
import type { DiaHistorial as Dia, Turno } from '../api';
import { textoRango } from '../rangoTurno';

function TurnoItem({ turno, vista }: { turno: Turno; vista: VistaHistorial }) {
  return (
    <li className="flex flex-col gap-0.5 rounded-lg border border-border bg-muted/50 p-3">
      <span className="font-medium tabular-nums">{textoRango(turno)}</span>
      {turno.origen === 'LIBRETA' && <EtiquetaLibreta />}
      {turno.minutosAcreditables !== null && (
        <span className="tabular-nums text-foreground">Acreditado: {formatHoras(turno.minutosAcreditables)}</span>
      )}
      {turno.sinConexion && <span className="text-sm text-muted-foreground">Registrado sin conexión</span>}
      {/* RN-19: notebook shifts are not corrected one by one; the whole week is corrected. */}
      {turno.origen !== 'LIBRETA' && <CorreccionTurno turno={turno} vista={vista} />}
    </li>
  );
}

// `vista` changes the wording and actions of corrections: the student requests them, the office resolves them (RF-17).
export function DiaHistorial({ dia, vista = 'alumno' }: { dia: Dia; vista?: VistaHistorial }) {
  const titulo = formatDiaCorto(dia.fecha);

  if (dia.turnos.length === 0) {
    return (
      <section
        aria-labelledby={`dia-${dia.fecha}`}
        className="flex items-baseline justify-between rounded-xl border border-dashed border-border px-4 py-3"
      >
        <h3 id={`dia-${dia.fecha}`} className="font-heading font-bold capitalize">
          {titulo}
        </h3>
        <span className="text-muted-foreground">Sin registros</span>
      </section>
    );
  }

  // RN-04: both values come from the API; the difference is only displayed.
  const noAcreditado = dia.minutosDia - dia.minutosAcreditablesDia;
  return (
    <SeccionCard aria-labelledby={`dia-${dia.fecha}`} className="gap-2">
      <h3 id={`dia-${dia.fecha}`} className="font-heading font-bold capitalize">
        {titulo}
      </h3>
      <ul className="flex flex-col gap-2">
        {dia.turnos.map((turno) => (
          <TurnoItem key={turno.id} turno={turno} vista={vista} />
        ))}
      </ul>
      <p className="font-medium tabular-nums">Total del día: {formatHoras(dia.minutosAcreditablesDia)}</p>
      {noAcreditado > 0 && (
        <p className="text-foreground">{formatHoras(noAcreditado)} no se acreditan (tope de {TOPE_DIARIO_TEXTO} por día)</p>
      )}
    </SeccionCard>
  );
}
