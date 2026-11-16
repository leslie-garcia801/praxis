import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Field } from '@/features/auth/components/Field';
import { ApiError } from '@/lib/api';
import { useUsuarioId } from '@/features/auth/api';
import { useEnLinea } from '@/lib/conexion';
import { encolarRegistro } from '@/offline/cola';
import { useCola } from '@/offline/colaCompartida';
import { useEstadoCola } from '@/offline/estadoCola';
import { TOPE_DIARIO_TEXTO } from '@/lib/reglas';
import { formatHora, formatHoras } from '@/lib/tiempo';
import { useRegistrarEscaneo, type Credencial, type EscaneoRequest, type EscaneoResponse } from '../api';
import { useQrScanner, type MotivoErrorCamara } from '../hooks/useQrScanner';
import { parseQr } from '../parseQr';
import { codigoCortoSchema, type CodigoCortoOutput, type CodigoCortoValues } from '../schemas';

const MENSAJES_CAMARA: Record<MotivoErrorCamara, string> = {
  permiso: 'No diste permiso para usar la cámara. Escribe el código de la institución.',
  'sin-camara': 'No encontramos una cámara en este dispositivo. Escribe el código de la institución.',
  otro: 'No se pudo abrir la cámara. Escribe el código de la institución.',
};

const linkClass = 'text-primary underline underline-offset-4';

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg border bg-muted p-3 text-foreground">
      {children}
    </p>
  );
}

function ErrorAviso({ message, action, onAction }: { message: string; action: string; onAction: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg bg-destructive/10 p-3 text-destructive">
      <p>{message}</p>
      <Button variant="outline" className="h-11 w-full" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}

function Confirmacion({ resultado }: { resultado: EscaneoResponse }) {
  const { tipo, asistencia, minutosAcreditablesDia, excedente } = resultado;
  const horaSalida = tipo === 'SALIDA' ? asistencia.salida : null;
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xl font-semibold">
        {horaSalida
          ? `Salida registrada a las ${formatHora(horaSalida)}`
          : `Entrada registrada a las ${formatHora(asistencia.entrada)}`}
      </p>
      {horaSalida && <p>{`Hoy llevas ${formatHoras(minutosAcreditablesDia)} acreditadas`}</p>}
      {/* RN-04 */}
      {excedente > 0 && <Aviso>{`Solo se acreditan ${TOPE_DIARIO_TEXTO} por día; ${formatHoras(excedente)} no cuentan`}</Aviso>}
      {/* RN-09 */}
      {horaSalida && asistencia.minutosAcreditables === 0 && (
        <Aviso>El turno duró menos de 15 minutos y no se acredita</Aviso>
      )}
      <Button asChild className="h-12 w-full">
        <Link to="/alumno">Volver al inicio</Link>
      </Button>
    </section>
  );
}

// RF-16: the scan was kept on the device. Whether it is an entry or an exit is unknown until the server sees it.
function ConfirmacionPendiente() {
  return (
    <section className="flex flex-col gap-3">
      <p role="status" className="text-xl font-semibold">
        Registro guardado. Pendiente de sincronizar.
      </p>
      <p>Se enviará solo cuando tengas conexión.</p>
      <Button asChild className="h-12 w-full">
        <Link to="/alumno">Volver al inicio</Link>
      </Button>
    </section>
  );
}

function CamaraPanel({
  onTexto,
  onError,
  enviando,
}: {
  onTexto: (texto: string) => void;
  onError: (motivo: MotivoErrorCamara) => void;
  enviando: boolean;
}) {
  const { videoRef, estado, motivo } = useQrScanner({ onResult: onTexto });

  useEffect(() => {
    if (estado === 'error') onError(motivo ?? 'otro');
  }, [estado, motivo, onError]);

  return (
    <div className="flex flex-col gap-2">
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Vista de la cámara"
        className="aspect-square w-full rounded-lg bg-black object-cover"
      />
      <p role="status" className="text-muted-foreground">
        {enviando ? 'Registrando…' : 'Apunta la cámara al código QR de tu institución.'}
      </p>
    </div>
  );
}

function CodigoForm({ enviando, onSubmit }: { enviando: boolean; onSubmit: (codigo: string) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CodigoCortoValues, unknown, CodigoCortoOutput>({
    resolver: zodResolver(codigoCortoSchema),
    defaultValues: { codigo: '' },
  });

  return (
    <form
      onSubmit={(e) => void handleSubmit(({ codigo }) => onSubmit(codigo))(e)}
      noValidate
      className="flex flex-col gap-4"
    >
      <Field
        id="codigo"
        label="Código de la institución"
        hint="Son 6 letras o números, y está junto al código QR."
        maxLength={6}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className="h-12 text-center text-xl uppercase tracking-widest"
        error={errors.codigo?.message}
        {...register('codigo')}
      />
      <Button type="submit" className="h-12 w-full text-lg" disabled={enviando}>
        {enviando ? 'Registrando…' : 'Registrar'}
      </Button>
    </form>
  );
}

type Guardado = 'guardando' | 'error' | 'listo' | 'sinUsuario';

// RF-14, RF-15, RF-16. The camera opens on arrival (the student tapped "Registrar" on the home screen);
// the short code is always offered. Every new attempt gets a new id. Without connection, or when the
// request fails by network, the scan goes to the offline queue: the queued record keeps the id (the
// request may have reached the server) and the time of the attempt, so sending it later is idempotent.
export function RegistrarPage() {
  const registrar = useRegistrarEscaneo();
  const cola = useCola();
  const { refrescar } = useEstadoCola();
  const enLinea = useEnLinea();
  const usuarioId = useUsuarioId();
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  const [modo, setModo] = useState<'camara' | 'codigo'>('camara');
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorQr, setErrorQr] = useState<string | null>(null);
  // Changing the key remounts the camera or the form so a new attempt starts clean.
  const [vista, setVista] = useState(0);

  async function guardarSinConexion(credencial: Credencial, id: string, ahora: Date) {
    // A record is only sent under its owner's session: without a known user it cannot be queued.
    if (!usuarioId) {
      setGuardado('sinUsuario');
      return;
    }
    setGuardado('guardando');
    try {
      await encolarRegistro(cola, credencial, usuarioId, ahora, id);
      setGuardado('listo');
      await refrescar();
    } catch {
      setGuardado('error');
    }
  }

  async function enviar(credencial: Credencial) {
    const ahora = new Date();
    const request: EscaneoRequest = { id: crypto.randomUUID(), ...credencial };
    if (!navigator.onLine) {
      await guardarSinConexion(credencial, request.id, ahora);
      return;
    }
    try {
      await registrar.mutateAsync(request);
    } catch (error) {
      // An ApiError is the server's answer (shown as is); anything else means fetch failed.
      if (!(error instanceof ApiError)) await guardarSinConexion(credencial, request.id, ahora);
    }
  }

  function nuevoIntento() {
    registrar.reset();
    setGuardado(null);
    setErrorQr(null);
    setVista((v) => v + 1);
  }

  function alLeerQr(texto: string) {
    const resultado = parseQr(texto);
    if (!resultado.ok) {
      setErrorQr(resultado.message);
      return;
    }
    void enviar({ token: resultado.token });
  }

  function alFallarCamara(motivo: MotivoErrorCamara) {
    setAviso(MENSAJES_CAMARA[motivo]);
    setModo('codigo');
  }

  function cambiarModo() {
    setAviso(null);
    setErrorQr(null);
    setModo(modo === 'camara' ? 'codigo' : 'camara');
  }

  function contenido(): ReactNode {
    if (registrar.isSuccess) return <Confirmacion resultado={registrar.data} />;
    if (guardado === 'listo') return <ConfirmacionPendiente />;
    if (guardado === 'error') {
      return (
        <ErrorAviso
          message="No se pudo guardar el registro en este dispositivo. Intenta de nuevo."
          action="Intentar de nuevo"
          onAction={nuevoIntento}
        />
      );
    }
    if (guardado === 'sinUsuario') {
      return (
        <ErrorAviso
          message="Inicia sesión para guardar tu registro."
          action="Intentar de nuevo"
          onAction={nuevoIntento}
        />
      );
    }
    if (guardado === 'guardando') return <Aviso>Guardando el registro…</Aviso>;
    if (registrar.isError) {
      const error = registrar.error;
      if (error instanceof ApiError) {
        return <ErrorAviso message={error.message} action="Intentar de nuevo" onAction={nuevoIntento} />;
      }
      return <Aviso>Guardando el registro…</Aviso>; // network error: it is being queued
    }
    if (errorQr) return <ErrorAviso message={errorQr} action="Intentar de nuevo" onAction={nuevoIntento} />;
    return (
      <>
        {!enLinea && <Aviso>Sin conexión. Tu registro se guardará en este dispositivo y se enviará después.</Aviso>}
        {aviso && <Aviso>{aviso}</Aviso>}
        {modo === 'camara' ? (
          <CamaraPanel key={vista} onTexto={alLeerQr} onError={alFallarCamara} enviando={registrar.isPending} />
        ) : (
          <CodigoForm
            key={vista}
            enviando={registrar.isPending}
            onSubmit={(codigoCorto) => void enviar({ codigoCorto })}
          />
        )}
        <button
          type="button"
          className={`${linkClass} self-start disabled:opacity-50`}
          onClick={cambiarModo}
          disabled={registrar.isPending}
        >
          {modo === 'camara' ? 'Escribir el código' : 'Usar la cámara'}
        </button>
      </>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Registrar asistencia</h1>
      {contenido()}
      {!registrar.isSuccess && guardado !== 'listo' && (
        <Link to="/alumno" className={`${linkClass} self-start`}>
          Cancelar
        </Link>
      )}
    </main>
  );
}
