import { useSyncExternalStore } from 'react';
import { ApiError } from './api';

function suscribir(avisar: () => void): () => void {
  window.addEventListener('online', avisar);
  window.addEventListener('offline', avisar);
  return () => {
    window.removeEventListener('online', avisar);
    window.removeEventListener('offline', avisar);
  };
}

// The browser's own idea of connectivity (RF-16). A request can still fail while this is true.
export function useEnLinea(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => navigator.onLine,
    () => true,
  );
}

// fetch threw instead of answering: there is no usable connection. An ApiError means the server answered.
export function esErrorDeRed(error: unknown): boolean {
  return error !== null && error !== undefined && !(error instanceof ApiError);
}
