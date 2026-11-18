import { TOPE_DIARIO_TEXTO } from '@/lib/reglas';
import { formatDiaCorto, formatHoras, formatRangoSemana } from '@/lib/tiempo';
import type { TurnoLibretaValues } from '../schemas';
import { agruparPorSemana } from '../vistaPrevia';

// RF-17a: live preview of what the student typed. The credited minutes are decided by the server (RN-04).
export function VistaPreviaLibreta({ turnos }: { turnos: TurnoLibretaValues[] }) {
  const semanas = agruparPorSemana(turnos);
  return (
    <section aria-labelledby="vista-previa-titulo" className="flex flex-col gap-3 rounded-lg border bg-muted p-3">
      <h2 id="vista-previa-titulo" className="text-lg font-semibold">
        Vista previa
      </h2>
      {semanas.length === 0 ? (
        <p className="text-foreground">Escribe la fecha y las horas de un turno para ver el total.</p>
      ) : (
        <>
          {semanas.map((semana) => (
            <div key={semana.inicio} className="flex flex-col gap-1">
              <h3 className="font-semibold">Semana del {formatRangoSemana(semana.inicio, semana.fin)}</h3>
              <ul className="flex flex-col gap-0.5 text-foreground">
                {semana.dias.map((dia) => (
                  <li key={dia.fecha}>{`${formatDiaCorto(dia.fecha)}: ${formatHoras(dia.minutos)}`}</li>
                ))}
              </ul>
              <p className="font-medium">{`Total de la semana: ${formatHoras(semana.minutos)}`}</p>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            {`Es una estimación: el sistema aplica el tope de ${TOPE_DIARIO_TEXTO} por día al calcular lo que se acredita.`}
          </p>
        </>
      )}
    </section>
  );
}
