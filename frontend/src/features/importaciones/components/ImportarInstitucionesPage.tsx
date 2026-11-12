import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import {
  confirmarInstituciones,
  institucionesKeys,
  previewInstituciones,
  type FilaReporteInstitucion,
  type ReporteImportacionInstituciones,
  type ResultadoImportacionInstituciones,
} from '../../instituciones/api';
import { isReporte, MAX_BYTES, messageOf, TOO_BIG_MESSAGE } from '../archivo';
import { AccionesVistaPrevia, Alert, Dato, Errores, PasoSubir } from './piezas';

type Paso =
  | { name: 'subir' }
  | { name: 'vista-previa'; reporte: ReporteImportacionInstituciones }
  | { name: 'resultado'; resultado: ResultadoImportacionInstituciones };

// RF-07: upload -> preview of every row -> confirm. The API decides what is valid; this only shows it.
export function ImportarInstitucionesPage() {
  const queryClient = useQueryClient();
  const [paso, setPaso] = useState<Paso>({ name: 'subir' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMutation({
    mutationFn: previewInstituciones,
    onSuccess: (reporte) => setPaso({ name: 'vista-previa', reporte }),
    onError: (e) => setError(messageOf(e)),
  });

  const confirmar = useMutation({
    mutationFn: confirmarInstituciones,
    onSuccess: (resultado) => {
      setPaso({ name: 'resultado', resultado });
      void queryClient.invalidateQueries({ queryKey: institucionesKeys.all });
    },
    onError: (e) => {
      setError(messageOf(e));
      // 422: nothing was written; show the fresh report so the user sees what to fix.
      if (e instanceof ApiError && e.status === 422 && isReporte<ReporteImportacionInstituciones>(e.details)) {
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
        <h1 className="text-2xl font-bold">Importar instituciones</h1>
      </header>

      {paso.name === 'subir' && (
        <PasoSubir
          plural="instituciones"
          templateHref="/api/importaciones/instituciones/plantilla"
          file={file}
          error={error}
          pending={preview.isPending}
          onFile={(f) => {
            setFile(f);
            setError(f && f.size > MAX_BYTES ? TOO_BIG_MESSAGE : null);
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

function estado(fila: FilaReporteInstitucion): string {
  if (fila.errores.length > 0) return 'Con errores';
  return fila.accion === 'OMITIR' ? 'Omitir' : 'Crear';
}

function PasoVistaPrevia({
  reporte,
  error,
  pending,
  onConfirm,
  onBack,
}: {
  reporte: ReporteImportacionInstituciones;
  error: string | null;
  pending: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const { resumen, filas } = reporte;
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
          <Dato label="A omitir" value={resumen.omitir} />
          <Dato label="Con errores" value={resumen.conErrores} />
        </dl>
      </section>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" aria-label="Filas del archivo">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-3">Fila</th>
              <th scope="col" className="py-2 pr-3">Nombre</th>
              <th scope="col" className="py-2 pr-3">Acción</th>
              <th scope="col" className="py-2 pr-3">Coincide con</th>
              <th scope="col" className="py-2">Errores</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.fila} className={`border-b border-border align-top ${fila.errores.length > 0 ? 'bg-destructive/5' : ''}`}>
                <td className="py-2 pr-3">{fila.fila}</td>
                <td className="py-2 pr-3">{fila.nombre}</td>
                <td className={`py-2 pr-3 font-semibold ${fila.errores.length > 0 ? 'text-destructive' : ''}`}>{estado(fila)}</td>
                <td className="py-2 pr-3">
                  {fila.coincideCon ? (
                    <>
                      {fila.coincideCon.nombre}{' '}
                      <span className="text-slate-700">(por {fila.coincideCon.por === 'RFC' ? 'RFC' : 'nombre'})</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2">
                  <Errores errores={fila.errores} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AccionesVistaPrevia bloqueada={resumen.conErrores > 0} pending={pending} onConfirm={onConfirm} onBack={onBack} />
    </section>
  );
}

function PasoResultado({ resultado, onReset }: { resultado: ResultadoImportacionInstituciones; onReset: () => void }) {
  const { creados, omitidos } = resultado.resumen;
  return (
    <section aria-labelledby="resultado-titulo" className="flex flex-col gap-4">
      <h2 id="resultado-titulo" className="text-lg font-semibold">
        Importación completada
      </h2>
      <section aria-label="Resultado">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato label="Instituciones creadas" value={creados} />
          <Dato label="Instituciones omitidas" value={omitidos} />
        </dl>
      </section>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link to="/vinculacion/instituciones" className={buttonVariants({ size: 'lg', className: 'h-11 sm:px-6' })}>
          Ver instituciones
        </Link>
        <Button variant="outline" size="lg" className="h-11 sm:px-6" onClick={onReset}>
          Importar otro archivo
        </Button>
      </div>
    </section>
  );
}
