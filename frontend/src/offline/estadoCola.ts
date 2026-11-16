import { createContext, useContext } from 'react';
import type { MotivoDetencion } from './sincronizar';
import type { RegistroPendiente } from './tipos';

export type RegistroRechazado = RegistroPendiente & { estado: { tipo: 'RECHAZADO'; code: string; message: string } };

// What the student screens know about the offline queue (RF-16).
export type EstadoCola = {
  pendientes: number;
  rechazados: RegistroRechazado[];
  // Why the last sync run stopped early (SESION: the student has to sign in again).
  detenidoPor: MotivoDetencion | undefined;
  refrescar: () => Promise<void>;
  descartar: (id: string) => Promise<void>;
};

// Outside the provider (screens rendered alone) the queue looks empty and inert.
const VACIO: EstadoCola = {
  pendientes: 0,
  rechazados: [],
  detenidoPor: undefined,
  refrescar: () => Promise.resolve(),
  descartar: () => Promise.resolve(),
};

export const EstadoColaContext = createContext<EstadoCola>(VACIO);

export function useEstadoCola(): EstadoCola {
  return useContext(EstadoColaContext);
}
