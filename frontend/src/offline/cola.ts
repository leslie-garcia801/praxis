import { isoConOffset } from '@/lib/tiempo';
import type { Credencial } from '@/features/escaneo/api';
import type { ColaPendientes, RegistroPendiente } from './tipos';

// RF-16: stores a scan taken without connection. The UUID makes the later send idempotent.
// `id` is passed when an online attempt failed by network: that request may have reached the
// server, so the queued record must carry the same id.
export async function encolarRegistro(
  cola: ColaPendientes,
  credencial: Credencial,
  usuarioId: string,
  ahora: Date = new Date(),
  id: string = crypto.randomUUID(),
): Promise<RegistroPendiente> {
  const registro: RegistroPendiente = {
    id,
    usuarioId,
    ...credencial,
    sinConexion: true,
    hora: isoConOffset(ahora),
    creadoEn: ahora.toISOString(),
    estado: { tipo: 'PENDIENTE' },
  };
  await cola.agregar(registro);
  return registro;
}

// Lets the student dismiss a record the server rejected for good.
export async function descartarRechazado(cola: ColaPendientes, id: string): Promise<void> {
  const registro = (await cola.listar()).find((r) => r.id === id);
  if (registro?.estado.tipo === 'RECHAZADO') await cola.eliminar(id);
}
