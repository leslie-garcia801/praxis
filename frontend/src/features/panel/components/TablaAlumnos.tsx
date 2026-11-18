import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatFecha, formatHora, formatHoras } from '@/lib/tiempo';
import type { FilaPanel, Riesgo } from '../api';

const ETIQUETA_RIESGO: Record<Riesgo, string> = {
  EN_RIESGO: 'En riesgo',
  EN_TIEMPO: 'En tiempo',
  SIN_DATOS: 'Sin datos suficientes',
  NO_EVALUABLE: 'No evaluable',
  COMPLETADO: 'Completado',
};

const TEXTO_TURNO = { MATUTINO: 'Matutino', VESPERTINO: 'Vespertino' } as const;

function EtiquetaRiesgo({ fila }: { fila: FilaPanel }) {
  if (fila.riesgo === 'EN_RIESGO') {
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge variant="destructive-solid">{ETIQUETA_RIESGO.EN_RIESGO}</Badge>
        {fila.limite && <span className="text-xs">Límite: {formatFecha(fila.limite)}</span>}
      </div>
    );
  }
  return <Badge variant="neutral">{ETIQUETA_RIESGO[fila.riesgo]}</Badge>;
}

function FechaEstimada({ fila }: { fila: FilaPanel }) {
  if (fila.fechaEstimada) return <>{formatFecha(fila.fechaEstimada)}</>;
  return <>{fila.riesgo === 'COMPLETADO' ? '—' : 'Sin datos suficientes'}</>;
}

// RF-25: the student name opens the detail of the case file.
function Fila({ fila }: { fila: FilaPanel }) {
  const { alumno } = fila;
  return (
    <tr className="border-b border-border align-top transition-colors last:border-b-0 hover:bg-accent/50 motion-reduce:transition-none">
      <td className="px-3 py-3">
        <Link to={`/vinculacion/expedientes/${fila.expediente.id}`} className="font-medium text-primary underline underline-offset-4">
          {alumno.nombre}
        </Link>
        {alumno.matricula && <div className="text-xs text-muted-foreground">{alumno.matricula}</div>}
      </td>
      <td className="px-3 py-3">
        <div>{alumno.carrera}</div>
        <div className="text-xs text-muted-foreground">
          Semestre {alumno.semestre} · Grupo {alumno.grupo} · {TEXTO_TURNO[alumno.turno]}
        </div>
      </td>
      <td className="px-3 py-3">{fila.institucion?.nombre ?? 'Sin institución'}</td>
      <td className="min-w-40 px-3 py-3">
        <div className="flex flex-col gap-1">
          <span className="tabular-nums">
            {formatHoras(fila.minutosValidados)} / {formatHoras(fila.metaMinutos)}
          </span>
          <Progress value={fila.porcentaje} aria-label={`Avance de ${alumno.nombre}`} className="h-2" />
          <span className="text-xs text-muted-foreground">{fila.porcentaje} %</span>
        </div>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{formatHoras(fila.minutosRegistrados)}</td>
      <td className="px-3 py-3">
        {fila.ultimoRegistro ? (
          <div className="flex flex-col">
            <span>{formatFecha(fila.ultimoRegistro)}</span>
            <span className="text-xs text-muted-foreground">{formatHora(fila.ultimoRegistro)}</span>
          </div>
        ) : (
          'Sin registros'
        )}
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{fila.semanasPendientes}</td>
      <td className="px-3 py-3">
        <FechaEstimada fila={fila} />
      </td>
      <td className="px-3 py-3">
        <EtiquetaRiesgo fila={fila} />
      </td>
    </tr>
  );
}

export function TablaAlumnos({ filas }: { filas: FilaPanel[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted">
            <th scope="col" className="px-3 py-3 font-semibold">Alumno</th>
            <th scope="col" className="px-3 py-3 font-semibold">Carrera</th>
            <th scope="col" className="px-3 py-3 font-semibold">Institución</th>
            <th scope="col" className="px-3 py-3 font-semibold">Horas validadas / meta</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Registradas sin validar</th>
            <th scope="col" className="px-3 py-3 font-semibold">Último registro</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Semanas pendientes</th>
            <th scope="col" className="px-3 py-3 font-semibold">Fecha estimada</th>
            <th scope="col" className="px-3 py-3 font-semibold">Riesgo</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <Fila key={fila.expediente.id} fila={fila} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
