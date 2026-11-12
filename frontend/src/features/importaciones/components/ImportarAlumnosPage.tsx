import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import {
  confirmarAlumnos,
  previewAlumnos,
  type FilaReporte,
  type ReporteImportacion,
  type ResultadoImportacion,
} from '../api';
import { isReporte, MAX_BYTES, messageOf, TOO_BIG_MESSAGE } from '../archivo';
import { AccionesVistaPrevia, Alert, Dato, Errores, PasoSubir } from './piezas';

type Paso =
  | { name: 'subir' }
  | { name: 'vista-previa'; reporte: ReporteImportacion }
  | { name: 'resultado'; resultado: ResultadoImportacion };

// RF-01 / F-02: upload -> preview of every row -> confirm. The API decides what is valid; this only shows it.
export function ImportarAlumnosPage() {
  const [paso, setPaso] = useState<Paso>({ name: 'subir' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMutation({
    mutationFn: previewAlumnos,
    onSuccess: (reporte) => setPaso({ name: 'vista-previa', reporte }),
    onError: (e) => setError(messageOf(e)),
  });

  const confirmar = useMutation({
    mutationFn: confirmarAlumnos,
    onSuccess: (resultado) => setPaso({ name: 'resultado', resultado }),
    onError: (e) => {
      setError(messageOf(e));
      // 422: nothing was written; show the fresh report so the user sees what to fix.
      if (e instanceof ApiError && e.status === 422 && isReporte<ReporteImportacion>(e.details)) {
        setPaso({ name: 'vista-previa', reporte: e.details });
      }
    },
  });

  function reiniciar() {
    setFile(null);
    setError(null);
    preview.reset();
    confirmar.reset();
    setPaso({ name: 'subir' });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Importar alumnos</h1>
      </header>

      {paso.name === 'subir' && (
        <PasoSubir
          plural="alumnos"
          templateHref="/api/importaciones/alumnos/plantilla"
          file={file}
          error={error}
          pending={preview.isPending}
          onFile={(f) => {
            setFile(f);
            setError(
              f && f.size > MAX_BYTES ? TOO_BIG_MESSAGE : null,
            );
          }}
          onSubmit={() => {
            if (!file) return;
            setError(null);
            preview.mutate(file);
          }}
        />
      )}

      {paso.name === 'vista-previa' && (
        <PasoVistaPrevia
          reporte={paso.reporte}
          error={error}
          pending={confirmar.isPending}
          onConfirm={() => {
            if (!file) return;
            setError(null);
            confirmar.mutate(file);
          }}
          onBack={reiniciar}
        />
      )}

      {paso.name === 'resultado' && <PasoResultado resultado={paso.resultado} onReset={reiniciar} />}
    </main>
  );
}

function estado(fila: FilaReporte): string {
  if (fila.errores.length > 0) return 'Con errores';
  return fila.accion === 'ACTUALIZAR' ? 'Actualizar' : 'Crear';
}

function PasoVistaPrevia({
  reporte,
  error,
  pending,
  onConfirm,
  onBack,
}: {
  reporte: ReporteImportacion;
  error: string | null;
  pending: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const { resumen, filas } = reporte;
  const bloqueada = resumen.conErrores > 0;
  return (
    <section aria-labelledby="previa-titulo" className="flex flex-col gap-4">
      <h2 id="previa-titulo" className="text-lg font-semibold">
        Vista previa
      </h2>
      {error && <Alert>{error}</Alert>}

      <section aria-label="Resumen">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato label="Total de filas" value={resumen.total} />
          <Dato label="A crear" value={resumen.crear} />
          <Dato label="A actualizar" value={resumen.actualizar} />
          <Dato label="Con errores" value={resumen.conErrores} />
        </dl>
      </section>

      <ul aria-label="Filas del archivo" className="flex flex-col gap-2 md:hidden">
        {filas.map((fila) => (
          <li
            key={fila.fila}
            className={`rounded-lg border p-3 ${fila.errores.length > 0 ? 'border-destructive border-l-4' : 'border-border'}`}
          >
            <p className="text-sm">
              <span className="font-medium">Fila {fila.fila}</span> · {fila.matricula}
            </p>
            <p className={`text-sm font-semibold ${fila.errores.length > 0 ? 'text-destructive' : ''}`}>{estado(fila)}</p>
            <Errores errores={fila.errores} />
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-left text-sm md:table" aria-label="Filas del archivo (tabla)">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3">Fila</th>
            <th scope="col" className="py-2 pr-3">Matrícula</th>
            <th scope="col" className="py-2 pr-3">Estado</th>
            <th scope="col" className="py-2">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.fila} className={`border-b border-border align-top ${fila.errores.length > 0 ? 'bg-destructive/5' : ''}`}>
              <td className="py-2 pr-3">{fila.fila}</td>
              <td className="py-2 pr-3">{fila.matricula}</td>
              <td className={`py-2 pr-3 font-semibold ${fila.errores.length > 0 ? 'text-destructive' : ''}`}>{estado(fila)}</td>
              <td className="py-2">
                <Errores errores={fila.errores} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <AccionesVistaPrevia bloqueada={bloqueada} pending={pending} onConfirm={onConfirm} onBack={onBack} />
    </section>
  );
}

function PasoResultado({ resultado, onReset }: { resultado: ResultadoImportacion; onReset: () => void }) {
  const { creados, actualizados, expedientesCreados } = resultado.resumen;
  return (
    <section aria-labelledby="resultado-titulo" className="flex flex-col gap-4">
      <h2 id="resultado-titulo" className="text-lg font-semibold">
        Importación completada
      </h2>
      <section aria-label="Resultado">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Dato label="Alumnos creados" value={creados} />
          <Dato label="Alumnos actualizados" value={actualizados} />
          <Dato label="Expedientes creados" value={expedientesCreados} />
        </dl>
      </section>
      <Button size="lg" className="h-11 w-full sm:w-fit sm:px-6" onClick={onReset}>
        Importar otro archivo
      </Button>
    </section>
  );
}
