import { useMutation } from '@tanstack/react-query';
import { downloadFile } from '@/lib/api';

export type RangoReporte = { desde?: string; hasta?: string };

export function reporteUrl(expedienteId: string, { desde, hasta }: RangoReporte): string {
  const params = new URLSearchParams();
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  const query = params.toString();
  return `/api/expedientes/${expedienteId}/reporte.pdf${query ? `?${query}` : ''}`;
}

// RF-27: downloads the hours and activities PDF of a case file, optionally for a date range; returns the file name.
export function useDescargarReporte(expedienteId: string) {
  return useMutation({
    mutationFn: (rango: RangoReporte) => downloadFile(reporteUrl(expedienteId, rango)),
  });
}
