import { Badge } from '@/components/ui/badge';

// RF-17a: marks weeks and shifts captured from the paper notebook.
export function EtiquetaLibreta() {
  return (
    <Badge variant="info">Libreta</Badge>
  );
}

export const TEXTO_SIN_BITACORA = 'Horas capturadas de la libreta de papel; esta semana no lleva bitácora.';
