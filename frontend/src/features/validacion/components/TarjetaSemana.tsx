import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { diaMonterrey, formatDiaCorto, formatHora, formatHoras, formatRangoSemana } from '@/lib/tiempo';
import type { SemanaValidacion, TurnoValidacion } from '../api';
import { FormRechazo } from './FormRechazo';

// "lunes 2 · 08:00 – 14:00 · 5 h". Hours are Monterrey time (RN-15); the credited minutes come from the API.
function textoTurno(turno: TurnoValidacion): string {
  const dia = formatDiaCorto(diaMonterrey(turno.entrada));
  const entrada = formatHora(turno.entrada);
  if (!turno.salida) return `${dia} · ${entrada} – Sin salida registrada`;
  const salida = formatHora(turno.salida);
  const otroDia = diaMonterrey(turno.salida) !== diaMonterrey(turno.entrada);
  const rango = `${entrada} – ${otroDia ? `${salida} (${formatDiaCorto(diaMonterrey(turno.salida))})` : salida}`;
  return turno.minutosAcreditables === null
    ? `${dia} · ${rango}`
    : `${dia} · ${rango} · ${formatHoras(turno.minutosAcreditables)}`;
}

type Props = {
  semana: SemanaValidacion;
  aviso?: string;
  ocupado: boolean;
  onValidar: () => void;
  onRechazar: (comentario: string) => void;
};

export function TarjetaSemana({ semana, aviso, ocupado, onValidar, onRechazar }: Props) {
  const [rechazando, setRechazando] = useState(false);
  const idTitulo = `semana-${semana.id}`;

  return (
    <article aria-labelledby={idTitulo} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <h3 id={idTitulo} className="font-semibold">
          Semana del {formatRangoSemana(semana.semanaInicio, semana.semanaFin)}
        </h3>
        <p className="text-slate-800">{semana.institucion}</p>
        <p className="font-medium">Total acreditado: {formatHoras(semana.minutosAcreditables)}</p>
      </div>

      {semana.turnos.length === 0 ? (
        <p className="text-slate-700">Sin turnos registrados</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {semana.turnos.map((turno) => (
            <li key={turno.entrada} className="flex flex-col gap-0.5 rounded-lg border p-3">
              <span className="font-medium">{textoTurno(turno)}</span>
              {turno.fueraDeHorario && (
                <span className="w-fit rounded-md bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-950">
                  Fuera del horario pactado
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1">
        <h4 className="font-medium">Bitácora</h4>
        <p className="whitespace-pre-line rounded-lg border bg-muted p-3 text-slate-900">
          {semana.actividades?.trim() ? semana.actividades : 'Sin bitácora'}
        </p>
      </div>

      {aviso && (
        <p role="status" className="font-medium text-slate-900">
          {aviso}
        </p>
      )}

      {semana.estado === 'VALIDADA' && <p className="font-semibold text-green-800">Validada</p>}
      {semana.estado === 'RECHAZADA' && <p className="font-semibold text-red-800">Rechazada</p>}

      {semana.estado === 'ENVIADA' &&
        (rechazando ? (
          <FormRechazo
            semanaId={semana.id}
            ocupado={ocupado}
            onConfirmar={onRechazar}
            onCancelar={() => setRechazando(false)}
          />
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" className="h-11 flex-1 text-base" onClick={onValidar} disabled={ocupado}>
              Validar
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 text-base"
              onClick={() => setRechazando(true)}
              disabled={ocupado}
            >
              Rechazar
            </Button>
          </div>
        ))}
    </article>
  );
}
