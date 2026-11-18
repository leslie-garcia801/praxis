import type { EstadoValidacion } from './api';

// Week state as a Badge variant: validated is success, rejected is an error, sent is informative, draft is neutral.
export const VARIANTE_VALIDACION: Record<EstadoValidacion, 'neutral' | 'info' | 'exito' | 'destructive'> = {
  BORRADOR: 'neutral',
  ENVIADA: 'info',
  VALIDADA: 'exito',
  RECHAZADA: 'destructive',
};
