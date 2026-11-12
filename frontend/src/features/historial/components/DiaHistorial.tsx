import { TOPE_DIARIO_TEXTO } from '@/lib/reglas';
import { diaMonterrey, formatDiaCorto, formatHora, formatHoras } from '@/lib/tiempo';
import type { DiaHistorial as Dia, Turno } from '../api';

// "10:11 – 16:18"; the exit carries its day when it is not the day of the entry (crosses midnight).
function textoRango(turno: Turno): string {
  const entrada = formatHora(turno.entrada);
  if (turno.estado === 'ABIERTA') return `${entrada} – en curso`;
  if (!turno.salida) return `${entrada} – Sin salida registrada`;
  const salida = formatHora(turno.salida);
  const otroDia = diaMonterrey(turno.salida) !== diaMonterrey(turno.entrada);
  return `${entrada} – ${otroDia ? `${salida} (${formatDiaCorto(diaMonterrey(turno.salida))})` : salida}`;
}

function TurnoItem({ turno }: { turno: Turno }) {
  return (
    <li className="flex flex-col gap-0.5 rounded-lg border p-3">
      <span className="font-medium">{textoRango(turno)}</span>
      {turno.minutosAcreditables !== null && (
        <span className="text-slate-800">Acreditado: {formatHoras(turno.minutosAcreditables)}</span>
      )}
      {turno.sinConexion && <span className="text-sm text-slate-700">Registrado sin conexión</span>}
    </li>
  );
}

export function DiaHistorial({ dia }: { dia: Dia }) {
  const titulo = formatDiaCorto(dia.fecha);

  if (dia.turnos.length === 0) {
    return (
      <section aria-labelledby={`dia-${dia.fecha}`} className="flex items-baseline justify-between">
        <h3 id={`dia-${dia.fecha}`} className="font-semibold capitalize">
          {titulo}
        </h3>
        <span className="text-slate-700">Sin registros</span>
      </section>
    );
  }

  // RN-04: both values come from the API; the difference is only displayed.
  const noAcreditado = dia.minutosDia - dia.minutosAcreditablesDia;
  return (
    <section aria-labelledby={`dia-${dia.fecha}`} className="flex flex-col gap-2">
      <h3 id={`dia-${dia.fecha}`} className="font-semibold capitalize">
        {titulo}
      </h3>
      <ul className="flex flex-col gap-2">
        {dia.turnos.map((turno) => (
          <TurnoItem key={turno.id} turno={turno} />
        ))}
      </ul>
      <p className="font-medium">Total del día: {formatHoras(dia.minutosAcreditablesDia)}</p>
      {noAcreditado > 0 && (
        <p className="text-slate-800">{formatHoras(noAcreditado)} no se acreditan (tope de {TOPE_DIARIO_TEXTO} por día)</p>
      )}
    </section>
  );
}
