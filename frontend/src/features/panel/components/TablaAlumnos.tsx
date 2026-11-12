import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatFecha, formatHora, formatHoras } from '@/lib/tiempo';
import { DescargarReporte } from '@/features/reporte/components/DescargarReporte';
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
        <span className="rounded-md bg-red-700 px-2 py-0.5 text-sm font-bold text-white">{ETIQUETA_RIESGO.EN_RIESGO}</span>
        {fila.limite && <span className="text-xs">Límite: {formatFecha(fila.limite)}</span>}
      </div>
    );
  }
  return <span className="rounded-md border px-2 py-0.5 text-sm">{ETIQUETA_RIESGO[fila.riesgo]}</span>;
}

function FechaEstimada({ fila }: { fila: FilaPanel }) {
  if (fila.fechaEstimada) return <>{formatFecha(fila.fechaEstimada)}</>;
  return <>{fila.riesgo === 'COMPLETADO' ? '—' : 'Sin datos suficientes'}</>;
}

// The row does not link yet: the student detail is task 0030 (the row is the place for it).
function Fila({ fila }: { fila: FilaPanel }) {
  const { alumno } = fila;
  // No dialog component in components/ui (only alert-dialog, meant for confirmations): an inline disclosure row.
  const [reporteAbierto, setReporteAbierto] = useState(false);
  return (
    <>
    <tr className="border-b border-border align-top">
      <td className="py-2 pr-3">
        <div className="font-medium">{alumno.nombre}</div>
        {alumno.matricula && <div className="text-xs text-slate-700">{alumno.matricula}</div>}
      </td>
      <td className="py-2 pr-3">
        <div>{alumno.carrera}</div>
        <div className="text-xs text-slate-700">
          Semestre {alumno.semestre} · Grupo {alumno.grupo} · {TEXTO_TURNO[alumno.turno]}
        </div>
      </td>
      <td className="py-2 pr-3">{fila.institucion?.nombre ?? 'Sin institución'}</td>
      <td className="min-w-40 py-2 pr-3">
        <div className="flex flex-col gap-1">
          <span>
            {formatHoras(fila.minutosValidados)} / {formatHoras(fila.metaMinutos)}
          </span>
          <Progress value={fila.porcentaje} aria-label={`Avance de ${alumno.nombre}`} className="h-2" />
          <span className="text-xs text-slate-700">{fila.porcentaje} %</span>
        </div>
      </td>
      <td className="py-2 pr-3">{formatHoras(fila.minutosRegistrados)}</td>
      <td className="py-2 pr-3">
        {fila.ultimoRegistro ? (
          <div className="flex flex-col">
            <span>{formatFecha(fila.ultimoRegistro)}</span>
            <span className="text-xs text-slate-700">{formatHora(fila.ultimoRegistro)}</span>
          </div>
        ) : (
          'Sin registros'
        )}
      </td>
      <td className="py-2 pr-3">{fila.semanasPendientes}</td>
      <td className="py-2 pr-3">
        <FechaEstimada fila={fila} />
      </td>
      <td className="py-2 pr-3">
        <EtiquetaRiesgo fila={fila} />
      </td>
      <td className="py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={reporteAbierto}
          aria-label={`Reporte de ${alumno.nombre}`}
          onClick={() => setReporteAbierto((v) => !v)}
        >
          Reporte
        </Button>
      </td>
    </tr>
    {reporteAbierto && (
      <tr className="border-b border-border">
        <td colSpan={10} className="py-3">
          <DescargarReporte expedienteId={fila.expediente.id} />
        </td>
      </tr>
    )}
    </>
  );
}

export function TablaAlumnos({ filas }: { filas: FilaPanel[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3">Alumno</th>
            <th scope="col" className="py-2 pr-3">Carrera</th>
            <th scope="col" className="py-2 pr-3">Institución</th>
            <th scope="col" className="py-2 pr-3">Horas validadas / meta</th>
            <th scope="col" className="py-2 pr-3">Registradas sin validar</th>
            <th scope="col" className="py-2 pr-3">Último registro</th>
            <th scope="col" className="py-2 pr-3">Semanas pendientes</th>
            <th scope="col" className="py-2 pr-3">Fecha estimada</th>
            <th scope="col" className="py-2 pr-3">Riesgo</th>
            <th scope="col" className="py-2">Reporte</th>
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
