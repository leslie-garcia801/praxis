import { useSyncExternalStore } from 'react';
import { establecerPreferencia, obtenerPreferencia, suscribirPreferencia } from './tema';

export function useTema() {
  const preferencia = useSyncExternalStore(suscribirPreferencia, obtenerPreferencia);
  return { preferencia, setPreferencia: establecerPreferencia };
}
