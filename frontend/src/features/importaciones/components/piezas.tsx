import { Button, buttonVariants } from '@/components/ui/button';
import { MAX_BYTES, type FilaError } from '../archivo';

// Pieces shared by the import screens (alumnos, instituciones).

export function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </div>
  );
}

export function Dato({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="text-sm text-slate-700">{label}</dt>
      <dd className="text-2xl font-bold">{value}</dd>
    </div>
  );
}

export function Errores({ errores }: { errores: FilaError[] }) {
  if (errores.length === 0) return null;
  return (
    <ul className="mt-1 list-disc pl-5 text-sm text-destructive">
      {errores.map((e, i) => (
        <li key={i}>
          <span className="font-medium">{e.campo}:</span> {e.mensaje}
        </li>
      ))}
    </ul>
  );
}

export function PasoSubir({
  plural,
  templateHref,
  file,
  error,
  pending,
  onFile,
  onSubmit,
}: {
  // "alumnos" / "instituciones": used in the copy and the file input label.
  plural: string;
  templateHref: string;
  file: File | null;
  error: string | null;
  pending: boolean;
  onFile: (file: File | null) => void;
  onSubmit: () => void;
}) {
  const tooBig = file !== null && file.size > MAX_BYTES;
  return (
    <section aria-labelledby="subir-titulo" className="flex flex-col gap-4">
      <h2 id="subir-titulo" className="text-lg font-semibold">
        Subir archivo
      </h2>
      <p className="text-sm text-slate-700">
        Usa la plantilla, llénala con tus {plural} y súbela en formato .xlsx o .csv (máximo 2 MB).
      </p>
      <a
        href={templateHref}
        download
        className={buttonVariants({ variant: 'outline', size: 'lg', className: 'h-11 w-fit px-4' })}
      >
        Descargar plantilla
      </a>
      <div className="flex flex-col gap-2">
        <label htmlFor="archivo" className="text-sm font-medium">
          Archivo de {plural}
        </label>
        <input
          id="archivo"
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:h-11 file:rounded-lg file:border file:border-border file:bg-background file:px-4"
        />
      </div>
      {error && <Alert>{error}</Alert>}
      <Button size="lg" className="h-11 w-full sm:w-fit sm:px-6" disabled={!file || tooBig || pending} onClick={onSubmit}>
        {pending ? 'Revisando…' : 'Revisar archivo'}
      </Button>
    </section>
  );
}

export function AccionesVistaPrevia({
  bloqueada,
  pending,
  onConfirm,
  onBack,
}: {
  bloqueada: boolean;
  pending: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <>
      {bloqueada && (
        <p className="text-sm text-slate-700">
          No se importará nada hasta que corrijas el archivo: todas las filas deben estar sin errores.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" className="h-11 sm:px-6" disabled={bloqueada || pending} onClick={onConfirm}>
          {pending ? 'Importando…' : 'Confirmar importación'}
        </Button>
        <Button variant="outline" size="lg" className="h-11 sm:px-6" onClick={onBack} disabled={pending}>
          Elegir otro archivo
        </Button>
      </div>
    </>
  );
}
