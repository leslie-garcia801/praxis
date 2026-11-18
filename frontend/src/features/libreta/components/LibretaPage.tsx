import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { useMe } from '@/features/auth/api';
import { formatHora, formatHoras, formatRangoSemana } from '@/lib/tiempo';
import { useHistorial, type SemanaHistorial } from '../../historial/api';
import type { SemanaLibreta } from '../api';
import type { TurnoLibretaValues } from '../schemas';
import { FormularioLibreta } from './FormularioLibreta';

const linkClass = 'text-primary underline underline-offset-4';

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg border bg-muted p-3 text-foreground">
      {children}
    </p>
  );
}

function Enviadas({ semanas }: { semanas: SemanaLibreta[] }) {
  return (
    <>
      <h2 className="text-xl font-semibold">Horas enviadas</h2>
      <p className="text-foreground">Tu supervisor las recibirá para validarlas. Las horas solo cuentan al validarse.</p>
      <ul className="flex flex-col gap-2">
        {semanas.map((s) => (
          <li key={s.id} className="flex flex-col gap-0.5 rounded-lg border p-3">
            <span className="font-medium">Semana del {formatRangoSemana(s.semanaInicio, s.semanaFin)}</span>
            <span className="text-foreground">Enviada al supervisor</span>
            <span className="text-foreground">{`Por validar: ${formatHoras(s.minutosAcreditables)}`}</span>
          </li>
        ))}
      </ul>
      <Link to="/alumno" className={linkClass}>
        Volver al inicio
      </Link>
    </>
  );
}

// Shifts of the rejected week as form rows (Monterrey wall-clock times, RN-15).
function turnosDeSemana(semana: SemanaHistorial): TurnoLibretaValues[] {
  return semana.dias.flatMap((dia) =>
    dia.turnos
      .filter((t) => t.salida !== null)
      .map((t) => ({ turnoId: t.id, fecha: dia.fecha, entrada: formatHora(t.entrada), salida: formatHora(t.salida!) })),
  );
}

function Introduccion() {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-foreground">
      <li>Usa esta pantalla solo para las horas que ya firmaste en tu libreta de papel antes de usar la app.</li>
      <li>Las horas solo cuentan cuando tu supervisor las valide.</li>
      <li>Puedes capturar semanas anteriores a la actual; las de esta semana se registran con QR.</li>
      <li>Cada turno empieza y termina el mismo día: no puede cruzar la medianoche.</li>
    </ul>
  );
}

function Correccion({ inicio, onEnviado }: { inicio: string; onEnviado: (semanas: SemanaLibreta[]) => void }) {
  const historial = useHistorial(inicio);
  const semana = historial.data;
  if (historial.isError && !semana) {
    return <ErrorConReintento message="No se pudo cargar la semana." onRetry={() => void historial.refetch()} />;
  }
  if (!semana || semana.inicio !== inicio) return <p>Cargando la semana…</p>;
  if (!semana.deLibreta || !semana.puedeCorregirLibreta || semana.id === null) {
    return (
      <>
        <Aviso>Esta semana ya no se puede corregir.</Aviso>
        <Link to={`/alumno/historial?semana=${encodeURIComponent(inicio)}`} className={linkClass}>
          Ver la semana en el historial
        </Link>
      </>
    );
  }
  return (
    <>
      <h2 className="text-lg font-semibold">{`Corrigiendo la semana del ${formatRangoSemana(semana.inicio, semana.fin)}`}</h2>
      {semana.comentario && (
        <p className="rounded-lg border bg-muted p-3 text-foreground">{`Tu supervisor la rechazó: «${semana.comentario}»`}</p>
      )}
      <p className="text-foreground">
        Los turnos que captures reemplazan a los anteriores de esta semana. Todas las fechas deben caer dentro de ella.
      </p>
      <FormularioLibreta
        correccion={{ semanaId: semana.id, inicio: semana.inicio, fin: semana.fin }}
        inicial={turnosDeSemana(semana)}
        onEnviado={onEnviado}
      />
    </>
  );
}

// RF-17a, RN-19: the student copies the shifts of the paper notebook; a rejected week is corrected from here.
export function LibretaPage() {
  const [params] = useSearchParams();
  const corregir = params.get('corregir');
  const me = useMe();
  const [enviadas, setEnviadas] = useState<SemanaLibreta[] | null>(null);
  const expediente = me.data?.expedienteActivo;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="text-[1.75rem] font-extrabold">{corregir ? 'Corregir horas' : 'Agregar horas'}</h1>
      {enviadas ? (
        <Enviadas semanas={enviadas} />
      ) : (
        <>
          {me.isPending && <p>Cargando…</p>}
          {me.isError && <ErrorConReintento message="No se pudo cargar tu expediente." onRetry={() => void me.refetch()} />}
          {me.data && expediente?.estado !== 'EN_PROCESO' && (
            <Aviso>Solo puedes agregar horas de libreta cuando tu expediente está en proceso.</Aviso>
          )}
          {me.data &&
            expediente?.estado === 'EN_PROCESO' &&
            (corregir ? (
              <Correccion inicio={corregir} onEnviado={setEnviadas} />
            ) : (
              <>
                <Introduccion />
                <FormularioLibreta fechaInicio={expediente.fechaInicio ?? undefined} onEnviado={setEnviadas} />
              </>
            ))}
          <Link to="/alumno" className={linkClass}>
            Volver al inicio
          </Link>
        </>
      )}
    </main>
  );
}
