import { useState } from 'react';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { messageOf } from '@/features/importaciones/archivo';
import { useAsignarPrograma, useCandidatos, type ResultadoAsignacion } from '../api';
import { ResultadoAsignacionPanel } from './ResultadoAsignacionPanel';
import { TablaCandidatos } from './TablaCandidatos';

type Resumen = { resultado: ResultadoAsignacion; nombres: Map<string, string> };

// RF-01, RN-03, RN-03a, RN-03b: the office assigns the next program to the students who finished the first one.
// The server decides who is eligible and what is assigned; this screen only sends the chosen ids.
export function AsignarProgramaPage() {
  const lista = useCandidatos();
  const asignar = useAsignarPrograma();
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const candidatos = lista.data ?? [];
  // Only students still in the list count (after a refresh the assigned ones are gone).
  const elegidos = candidatos.filter((c) => marcados.has(c.alumnoId));
  const seleccionados = new Set(elegidos.map((c) => c.alumnoId));
  const todos = candidatos.length > 0 && elegidos.length === candidatos.length;
  const textoBoton = `Asignar programa a ${elegidos.length} ${elegidos.length === 1 ? 'alumno' : 'alumnos'}`;

  function alternar(id: string) {
    const siguiente = new Set(seleccionados);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    setMarcados(siguiente);
  }

  async function confirmar() {
    setError(null);
    const nombres = new Map(elegidos.map((c) => [c.alumnoId, c.nombre]));
    try {
      const resultado = await asignar.mutateAsync(elegidos.map((c) => c.alumnoId));
      setResumen({ resultado, nombres });
      setMarcados(new Set());
      setConfirmando(false);
    } catch (e) {
      setConfirmando(false);
      setError(messageOf(e));
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[1.75rem] font-extrabold">Asignar el siguiente programa</h1>
        <p className="text-foreground">Alumnos que ya terminaron su primer programa y pueden empezar el que le toca a tu oficina.</p>
      </header>

      {resumen && <ResultadoAsignacionPanel resultado={resumen.resultado} nombres={resumen.nombres} onCerrar={() => setResumen(null)} />}

      {lista.isPending && (
        <p role="status" className="text-muted-foreground">
          Cargando alumnos…
        </p>
      )}
      {lista.isError && <ErrorConReintento message={messageOf(lista.error)} onRetry={() => void lista.refetch()} />}
      {lista.data && candidatos.length === 0 && (
        <p role="status" className="rounded-lg border-2 border-info-borde bg-info p-3 text-info-foreground">
          No hay alumnos listos para asignar.
        </p>
      )}
      {candidatos.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="size-5"
                checked={todos}
                ref={(el) => {
                  if (el) el.indeterminate = elegidos.length > 0 && !todos;
                }}
                onChange={() => setMarcados(todos ? new Set() : new Set(candidatos.map((c) => c.alumnoId)))}
              />
              <span>Seleccionar todos</span>
            </label>
            <Button type="button" className="h-11 px-4" disabled={elegidos.length === 0 || asignar.isPending} onClick={() => setConfirmando(true)}>
              {textoBoton}
            </Button>
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
              {error}
            </p>
          )}
          <TablaCandidatos candidatos={candidatos} seleccionados={seleccionados} onAlternar={alternar} />
        </>
      )}

      <AlertDialog open={confirmando} onOpenChange={(abierto) => !asignar.isPending && setConfirmando(abierto)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Asignar el programa?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Se abrirá un expediente nuevo para ${elegidos.length === 1 ? 'el alumno elegido' : `los ${elegidos.length} alumnos elegidos`}, en el programa que le toca.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={asignar.isPending}>Volver</AlertDialogCancel>
            <Button type="button" disabled={asignar.isPending} onClick={() => void confirmar()}>
              {asignar.isPending ? 'Asignando…' : 'Sí, asignar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
