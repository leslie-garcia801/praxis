import { AvisoTemporal } from '@/components/AvisoTemporal';
import type { ReenvioEnlace } from '../api';

// RF-09, RF-21: after the office fixes a supervisor's email, the API revokes the old links and emails the pending
// weeks to the new address. This tells the office what happened.
export function AvisoReenvio({ reenvio }: { reenvio: ReenvioEnlace | null }) {
  if (!reenvio) return null;
  const semanas = reenvio.semanas === 1 ? '1 semana pendiente' : `${reenvio.semanas} semanas pendientes`;
  if (reenvio.enviado) {
    return <AvisoTemporal>Se envió un enlace nuevo al supervisor con {semanas} de validar.</AvisoTemporal>;
  }
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      No se pudo enviar el enlace nuevo al supervisor ({semanas} de validar). Se enviará en el resumen del lunes.
    </p>
  );
}
