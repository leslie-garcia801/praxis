import { useState } from 'react';
import { useParams } from 'react-router';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { formatFecha } from '@/lib/tiempo';
import { useEnlaceValidacion, useResolverSemanas, type Decision, type SemanaValidacion } from '../api';
import { TarjetaSemana } from './TarjetaSemana';

const MENSAJE_FALLBACK = 'No se pudo completar la solicitud. Intenta de nuevo.';

function Pantalla({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">{children}</main>;
}

function mensajeError(error: unknown): string {
  return error instanceof ApiError && error.code !== 'UNKNOWN_ERROR' ? error.message : MENSAJE_FALLBACK;
}

// Groups the weeks by student, keeping the order the API sends (by student and date).
function agruparPorAlumno(semanas: SemanaValidacion[]) {
  const grupos: { nombre: string; carrera: string; semanas: SemanaValidacion[] }[] = [];
  for (const semana of semanas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.nombre === semana.alumno.nombre) ultimo.semanas.push(semana);
    else grupos.push({ ...semana.alumno, semanas: [semana] });
  }
  return grupos;
}

// Public page opened from the weekly email (RF-21). No session: it never reads the signed-in user.
export function ValidarSemanasPage() {
  const { token = '' } = useParams();
  const enlace = useEnlaceValidacion(token);
  const resolver = useResolverSemanas(token);
  const [confirmando, setConfirmando] = useState(false);
  const [avisos, setAvisos] = useState<Record<string, string>>({});
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  if (enlace.isPending) {
    return (
      <Pantalla>
        <p role="status">Cargando semanas…</p>
      </Pantalla>
    );
  }

  if (enlace.isError) {
    const error = enlace.error;
    if (error instanceof ApiError && error.code === 'ENLACE_NO_VALIDO') {
      return (
        <Pantalla>
          <h1 className="text-2xl font-bold">Este enlace no es válido.</h1>
        </Pantalla>
      );
    }
    if (error instanceof ApiError && error.code === 'ENLACE_VENCIDO') {
      return (
        <Pantalla>
          <h1 className="text-2xl font-bold">Este enlace venció. Usa el del correo más reciente.</h1>
        </Pantalla>
      );
    }
    return (
      <Pantalla>
        <ErrorConReintento message={mensajeError(error)} onRetry={() => void enlace.refetch()} />
      </Pantalla>
    );
  }

  const { supervisor, expiraEn, semanas } = enlace.data;
  const pendientes = semanas.filter((s) => s.estado === 'ENVIADA');

  async function enviar(decisiones: Decision[]) {
    setErrorEnvio(null);
    try {
      const { resultados } = await resolver.mutateAsync(decisiones);
      setAvisos((previos) => {
        const siguiente = { ...previos };
        for (const r of resultados) {
          if (r.resultado === 'YA_RESUELTA') siguiente[r.semanaId] = 'Esta semana ya se había resuelto';
          else delete siguiente[r.semanaId];
        }
        return siguiente;
      });
    } catch (e) {
      setErrorEnvio(mensajeError(e));
    }
  }

  async function validarTodo() {
    setConfirmando(false);
    await enviar(pendientes.map((s): Decision => ({ semanaId: s.id, accion: 'VALIDAR' })));
  }

  return (
    <Pantalla>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Hola, {supervisor.nombre}</h1>
        {pendientes.length > 0 && (
          <p className="text-lg">
            {pendientes.length === 1 ? 'Tienes 1 semana pendiente.' : `Tienes ${pendientes.length} semanas pendientes.`}
          </p>
        )}
        <p className="text-slate-800">Este enlace vence el {formatFecha(expiraEn)}</p>
      </header>

      {errorEnvio && (
        <p role="alert" className="text-destructive">
          {errorEnvio}
        </p>
      )}

      {pendientes.length === 0 ? (
        <p className="text-lg font-medium">Listo, no tienes semanas pendientes. Gracias.</p>
      ) : (
        <Button type="button" className="h-12 text-base" onClick={() => setConfirmando(true)} disabled={resolver.isPending}>
          Validar todo
        </Button>
      )}

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Vas a validar {pendientes.length} {pendientes.length === 1 ? 'semana' : 'semanas'}
            </AlertDialogTitle>
            <AlertDialogDescription>Se validarán todas las semanas pendientes de este enlace.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void validarTodo()}>Sí, validar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {agruparPorAlumno(semanas).map((grupo) => (
        <section key={grupo.nombre} aria-label={grupo.nombre} className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">{grupo.nombre}</h2>
            <p className="text-slate-800">{grupo.carrera}</p>
          </div>
          {grupo.semanas.map((semana) => (
            <TarjetaSemana
              key={semana.id}
              semana={semana}
              aviso={avisos[semana.id]}
              ocupado={resolver.isPending}
              onValidar={() => void enviar([{ semanaId: semana.id, accion: 'VALIDAR' }])}
              onRechazar={(comentario) => void enviar([{ semanaId: semana.id, accion: 'RECHAZAR', comentario }])}
            />
          ))}
        </section>
      ))}
    </Pantalla>
  );
}
