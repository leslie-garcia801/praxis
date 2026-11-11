import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Field } from '@/features/auth/components/Field';
import { ApiError } from '@/lib/api';
import { formatHora, formatHoras } from '@/lib/tiempo';
import { useRegistrarEscaneo, type Credencial, type EscaneoRequest, type EscaneoResponse } from '../api';
import { useQrScanner, type MotivoErrorCamara } from '../hooks/useQrScanner';
import { parseQr } from '../parseQr';
import { codigoCortoSchema, type CodigoCortoOutput, type CodigoCortoValues } from '../schemas';

const MENSAJE_SIN_RED = 'No hay conexión. Intenta de nuevo.';

const MENSAJES_CAMARA: Record<MotivoErrorCamara, string> = {
  permiso: 'No diste permiso para usar la cámara. Escribe el código de la institución.',
  'sin-camara': 'No encontramos una cámara en este dispositivo. Escribe el código de la institución.',
  otro: 'No se pudo abrir la cámara. Escribe el código de la institución.',
};

const linkClass = 'text-primary underline underline-offset-4';

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg border bg-muted p-3 text-slate-800">
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
      {excedente > 0 && <Aviso>{`Solo se acreditan 5 h por día; ${formatHoras(excedente)} no cuentan`}</Aviso>}
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
      <p role="status" className="text-slate-700">
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

// RF-14, RF-15. The camera opens on arrival (the student tapped "Registrar" on the home screen);
// the short code is always offered. Every new attempt gets a new id; retrying after a network
// error reuses it so the server does not duplicate the record (task 0014).
export function RegistrarPage() {
  const registrar = useRegistrarEscaneo();
  const [modo, setModo] = useState<'camara' | 'codigo'>('camara');
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorQr, setErrorQr] = useState<string | null>(null);
  const [intento, setIntento] = useState<EscaneoRequest | null>(null);
  // Changing the key remounts the camera or the form so a new attempt starts clean.
  const [vista, setVista] = useState(0);

  function enviar(credencial: Credencial) {
    const request: EscaneoRequest = { id: crypto.randomUUID(), ...credencial };
    setIntento(request);
    registrar.mutate(request);
  }

  function nuevoIntento() {
    registrar.reset();
    setIntento(null);
    setErrorQr(null);
    setVista((v) => v + 1);
  }

  function alLeerQr(texto: string) {
    const resultado = parseQr(texto);
    if (!resultado.ok) {
      setErrorQr(resultado.message);
      return;
    }
    enviar({ token: resultado.token });
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
    if (registrar.isError) {
      const error = registrar.error;
      if (error instanceof ApiError) {
        return <ErrorAviso message={error.message} action="Intentar de nuevo" onAction={nuevoIntento} />;
      }
      return (
        <ErrorAviso
          message={MENSAJE_SIN_RED}
          action="Reintentar"
          onAction={() => intento && registrar.mutate(intento)}
        />
      );
    }
    if (errorQr) return <ErrorAviso message={errorQr} action="Intentar de nuevo" onAction={nuevoIntento} />;
    return (
      <>
        {aviso && <Aviso>{aviso}</Aviso>}
        {modo === 'camara' ? (
          <CamaraPanel key={vista} onTexto={alLeerQr} onError={alFallarCamara} enviando={registrar.isPending} />
        ) : (
          <CodigoForm
            key={vista}
            enviando={registrar.isPending}
            onSubmit={(codigoCorto) => enviar({ codigoCorto })}
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
      {!registrar.isSuccess && (
        <Link to="/alumno" className={`${linkClass} self-start`}>
          Cancelar
        </Link>
      )}
    </main>
  );
}
