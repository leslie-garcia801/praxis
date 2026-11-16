import { ApiError } from '@/lib/api';
import type { EscaneoRequest, EscaneoResponse } from '@/features/escaneo/api';
import type { ColaPendientes, RegistroPendiente } from './tipos';

export type MotivoDetencion = 'RED' | 'SERVIDOR' | 'SESION' | 'LIMITE';

export type ResumenSincronizacion = {
  enviados: number;
  rechazados: number;
  restantes: number; // pending (not rejected) records still in the queue
  detenidoPor?: MotivoDetencion;
};

export type EnviarEscaneo = (request: EscaneoRequest) => Promise<EscaneoResponse>;

// 4xx are definitive rejections, except these (kept; the run stops): 401 (session expired,
// retry after sign-in), 408 and 429.
const REINTENTABLES: Record<number, MotivoDetencion> = { 401: 'SESION', 408: 'LIMITE', 429: 'LIMITE' };

// undefined means a definitive rejection.
function motivoDeDetencion(error: unknown): MotivoDetencion | undefined {
  if (!(error instanceof ApiError)) return 'RED'; // fetch failed: no connection
  if (error.status >= 500) return 'SERVIDOR';
  const reintentable = REINTENTABLES[error.status];
  if (reintentable) return reintentable;
  return error.status >= 400 ? undefined : 'SERVIDOR';
}

function aSolicitud(registro: RegistroPendiente): EscaneoRequest {
  const { id, hora, sinConexion } = registro;
  const credencial = 'token' in registro ? { token: registro.token } : { codigoCorto: registro.codigoCorto };
  return { id, ...credencial, hora, sinConexion };
}

const enCurso = new WeakMap<ColaPendientes, Promise<ResumenSincronizacion>>();

async function ejecutar(
  cola: ColaPendientes,
  enviar: EnviarEscaneo,
  usuarioId: string,
): Promise<ResumenSincronizacion> {
  const resumen: ResumenSincronizacion = { enviados: 0, rechazados: 0, restantes: 0 };
  const registros = await cola.listar();
  // A record with no owner can never be attributed to anyone: it is dropped, never sent.
  for (const registro of registros) {
    if (typeof registro.usuarioId !== 'string' || registro.usuarioId === '') await cola.eliminar(registro.id);
  }
  // Records of other students stay untouched until they sign in again.
  const pendientes = registros.filter((r) => r.usuarioId === usuarioId && r.estado.tipo === 'PENDIENTE');
  let restantes = pendientes.length;

  // One at a time, oldest first: an exit depends on its entry having arrived.
  for (const registro of pendientes) {
    try {
      await enviar(aSolicitud(registro));
    } catch (error) {
      const motivo = motivoDeDetencion(error);
      if (motivo === undefined && error instanceof ApiError) {
        await cola.marcarRechazado(registro.id, { code: error.code, message: error.message });
        resumen.rechazados += 1;
        restantes -= 1;
        continue;
      }
      resumen.detenidoPor = motivo;
      break;
    }
    await cola.eliminar(registro.id);
    resumen.enviados += 1;
    restantes -= 1;
  }
  resumen.restantes = restantes;
  return resumen;
}

// RF-16, RN-14: sends the pending records of `usuarioId` (the signed-in student) and no one else's.
// Concurrent calls on the same queue share one run, so a record is never sent twice.
export function sincronizarPendientes(
  cola: ColaPendientes,
  enviar: EnviarEscaneo,
  usuarioId: string,
): Promise<ResumenSincronizacion> {
  const actual = enCurso.get(cola);
  if (actual) return actual;
  const corrida = ejecutar(cola, enviar, usuarioId).finally(() => enCurso.delete(cola));
  enCurso.set(cola, corrida);
  return corrida;
}
