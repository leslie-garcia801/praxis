import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { formatFecha, hoyMonterrey } from '@/lib/tiempo';
import type { SemanaHistorial } from '../../historial/api';
import { useEnviarSemana, useGuardarBitacora } from '../api';

// Mirrors the server limits for the form only; the server decides (RF-20, RN-17).
const MAX_ACTIVIDADES = 5000;
const MINIMO_ACTIVIDADES = 50;

const AVISO_EN_CURSO =
  'Podrás enviarla a partir del lunes. Si la dejas lista (50 caracteres o más), se envía sola el lunes a tu supervisor';

function mensajeError(error: unknown, accion: 'guardar' | 'enviar'): string {
  if (error instanceof ApiError && error.code !== 'UNKNOWN_ERROR') return error.message;
  return accion === 'guardar'
    ? 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.'
    : 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.';
}

function Seccion({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="bitacora-titulo" className="flex flex-col gap-3">
      <h3 id="bitacora-titulo" className="text-lg font-semibold">
        Bitácora
      </h3>
      {children}
    </section>
  );
}

function SoloLectura({ actividades, children }: { actividades: string | null; children?: React.ReactNode }) {
  return (
    <>
      <p className="whitespace-pre-wrap rounded-lg border bg-muted p-3 text-slate-900">
        {actividades?.trim() ? actividades : 'Sin bitácora'}
      </p>
      {children}
    </>
  );
}

function Editor({ semana, semanaId }: { semana: SemanaHistorial; semanaId: string }) {
  const guardar = useGuardarBitacora(semanaId);
  const enviar = useEnviarSemana(semanaId);
  const [texto, setTexto] = useState(semana.actividades ?? '');
  // Last text the server has; the form is dirty while the textarea differs from it.
  const [guardado, setGuardado] = useState(semana.actividades ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState(false);

  const pendiente = texto !== guardado;
  const ocupado = guardar.isPending || enviar.isPending;
  const caracteres = texto.trim().length;
  const suficiente = caracteres >= MINIMO_ACTIVIDADES;
  // Display only: the history already marks the current week this way. The server rejects an early send.
  const enCurso = semana.fin >= hoyMonterrey();

  // Leaving the week with unsaved text asks first (in-app navigation and closing the tab).
  const blocker = useBlocker(pendiente);
  useEffect(() => {
    if (!pendiente) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [pendiente]);

  async function guardarTexto() {
    const { semana: respuesta } = await guardar.mutateAsync(texto);
    setGuardado(respuesta.actividades ?? texto);
  }

  async function onGuardar() {
    setError(null);
    setConfirmacion(false);
    try {
      await guardarTexto();
      setConfirmacion(true);
    } catch (e) {
      setError(mensajeError(e, 'guardar'));
    }
  }

  // The server sends what is saved: unsaved changes are saved first, then the week is sent.
  async function onEnviar() {
    setError(null);
    setConfirmacion(false);
    try {
      if (pendiente) await guardarTexto();
    } catch (e) {
      setError(mensajeError(e, 'guardar'));
      return;
    }
    try {
      await enviar.mutateAsync();
    } catch (e) {
      setError(mensajeError(e, 'enviar'));
    }
  }

  return (
    <>
      {semana.estadoValidacion === 'RECHAZADA' && semana.comentario && (
        <p role="alert" className="rounded-lg border border-destructive bg-destructive/10 p-3 font-medium text-destructive">
          Tu supervisor la rechazó: «{semana.comentario}». Corrígela y vuelve a enviarla
        </p>
      )}
      {enCurso && (
        <p role="status" className="rounded-lg border bg-muted p-3 text-slate-800">
          {AVISO_EN_CURSO}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <Textarea
          aria-label="Actividades de la semana"
          aria-describedby="bitacora-contador"
          maxLength={MAX_ACTIVIDADES}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setConfirmacion(false);
          }}
        />
        <p id="bitacora-contador" className="text-sm text-slate-700">
          {caracteres} de {MINIMO_ACTIVIDADES} caracteres mínimos
        </p>
      </div>
      {blocker.state === 'blocked' && (
        <div role="alertdialog" aria-label="Cambios sin guardar" className="flex flex-col gap-2 rounded-lg border bg-muted p-3">
          <p>Tienes cambios sin guardar. Si sales, se perderán.</p>
          <div className="flex gap-2">
            <Button type="button" className="flex-1" onClick={() => blocker.reset()}>
              Seguir editando
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => blocker.proceed()}>
              Salir sin guardar
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {confirmacion && !pendiente && (
        <p role="status" className="text-slate-800">
          Cambios guardados
        </p>
      )}
      <Button type="button" variant="outline" className="h-12" disabled={!pendiente || ocupado} onClick={() => void onGuardar()}>
        Guardar
      </Button>
      {semana.puedeEnviar && (
        <>
          <Button type="button" className="h-12" disabled={!suficiente || ocupado} onClick={() => void onEnviar()}>
            Enviar a mi supervisor
          </Button>
          {!suficiente && (
            <p className="text-sm text-slate-700">Escribe al menos {MINIMO_ACTIVIDADES} caracteres para poder enviar la bitácora</p>
          )}
        </>
      )}
    </>
  );
}

// RF-20, RF-22, RN-17: the logbook of the shown week. The server decides what can be edited or sent.
export function BitacoraSemana({ semana }: { semana: SemanaHistorial }) {
  if (semana.id === null) {
    return (
      <Seccion>
        <p role="status" className="rounded-lg border bg-muted p-3 text-slate-800">
          La bitácora se habilita con tu primer registro de la semana
        </p>
      </Seccion>
    );
  }

  if (semana.estadoValidacion === 'ENVIADA') {
    return (
      <Seccion>
        <SoloLectura actividades={semana.actividades}>
          {semana.enviadaEn && <p className="text-slate-800">Enviada a tu supervisor el {formatFecha(semana.enviadaEn)}</p>}
        </SoloLectura>
      </Seccion>
    );
  }

  if (semana.estadoValidacion === 'VALIDADA') {
    return (
      <Seccion>
        <SoloLectura actividades={semana.actividades}>
          <p className="text-slate-800">Validada por tu supervisor</p>
        </SoloLectura>
      </Seccion>
    );
  }

  if (!semana.puedeEditar) {
    return (
      <Seccion>
        <SoloLectura actividades={semana.actividades} />
      </Seccion>
    );
  }

  return (
    <Seccion>
      <Editor semana={semana} semanaId={semana.id} />
    </Seccion>
  );
}
