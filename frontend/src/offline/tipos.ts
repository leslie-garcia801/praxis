import type { EscaneoRequest } from '@/features/escaneo/api';

// RF-16, RN-14: a scan taken without connection, kept on the device until it can be sent.
// `hora` is the device clock (ISO with offset) captured when the student scanned; the server
// accepts it only if it is at most 72 h old.
export type EstadoRegistro = { tipo: 'PENDIENTE' } | { tipo: 'RECHAZADO'; code: string; message: string };

// `usuarioId` is the student who queued it: a record is only ever sent under that student's session.
export type RegistroPendiente = EscaneoRequest & {
  usuarioId: string;
  sinConexion: true;
  hora: string;
  creadoEn: string;
  estado: EstadoRegistro;
};

export type Rechazo = { code: string; message: string };

// Storage port for the queue. Implementations must list in creation order (`creadoEn`).
export interface ColaPendientes {
  agregar(registro: RegistroPendiente): Promise<void>;
  listar(): Promise<RegistroPendiente[]>;
  eliminar(id: string): Promise<void>;
  marcarRechazado(id: string, rechazo: Rechazo): Promise<void>;
}
