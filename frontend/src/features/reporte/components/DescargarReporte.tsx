import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { messageOf } from '../../importaciones/archivo';
import { useDescargarReporte } from '../api';

const MENSAJE_RANGO = 'La fecha inicial no puede ser posterior a la fecha final.';

// RF-27: optional date range (calendar days, ISO strings compare correctly) and the PDF download.
export function DescargarReporte({ expedienteId }: { expedienteId: string }) {
  const id = useId();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [error, setError] = useState<string | null>(null);
  const descarga = useDescargarReporte(expedienteId);

  const rangoInvalido = desde !== '' && hasta !== '' && desde > hasta;

  function descargar() {
    if (rangoInvalido) {
      setError(MENSAJE_RANGO);
      return;
    }
    setError(null);
    descarga.mutate(
      { desde: desde || undefined, hasta: hasta || undefined },
      { onError: (e) => setError(messageOf(e)) },
    );
  }

  return (
    <section aria-label="Reporte de horas y actividades" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-desde`}>Desde</Label>
          <Input id={`${id}-desde`} type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-hasta`}>Hasta</Label>
          <Input id={`${id}-hasta`} type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <Button type="button" variant="outline" className="min-h-10" disabled={descarga.isPending} onClick={descargar}>
          {descarga.isPending ? 'Descargando…' : 'Descargar reporte'}
        </Button>
      </div>
      <p className="text-sm text-slate-700">Sin fechas, el reporte incluye todo el expediente. Solo cuenta las semanas validadas.</p>
      {(error ?? (rangoInvalido ? MENSAJE_RANGO : null)) && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ?? MENSAJE_RANGO}
        </p>
      )}
    </section>
  );
}
