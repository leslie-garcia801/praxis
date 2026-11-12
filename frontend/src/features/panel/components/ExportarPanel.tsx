import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { messageOf } from '../../importaciones/archivo';
import { useExportarPanel, type FiltrosPanel } from '../api';
import { TITULO_ALERTA, type ClaveAlerta } from '../alertas';

type Props = { filtros: FiltrosPanel; alerta: ClaveAlerta | null };

// RF-26: Excel downloads that use the table filters of the URL. The alert filter is local to the screen, so it is
// not part of the export; when one is active the user is told.
export function ExportarPanel({ filtros, alerta }: Props) {
  const [error, setError] = useState<string | null>(null);
  const tabla = useExportarPanel('alumnos', filtros);
  const edumedia = useExportarPanel('edumedia', filtros);
  const ocupado = tabla.isPending || edumedia.isPending;

  function exportar(mutacion: typeof tabla) {
    setError(null);
    mutacion.mutate(undefined, { onError: (e) => setError(messageOf(e)) });
  }

  return (
    <section aria-label="Exportar" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" className="min-h-10" disabled={ocupado} onClick={() => exportar(tabla)}>
          {tabla.isPending ? 'Descargando…' : 'Exportar tabla'}
        </Button>
        <Button type="button" variant="outline" className="min-h-10" disabled={ocupado} onClick={() => exportar(edumedia)}>
          {edumedia.isPending ? 'Descargando…' : 'Exportar para Edumedia'}
        </Button>
      </div>
      {alerta && (
        <p className="text-sm text-slate-700">
          La exportación usa los filtros de la tabla, pero no el filtro de alerta ({TITULO_ALERTA[alerta]}).
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
