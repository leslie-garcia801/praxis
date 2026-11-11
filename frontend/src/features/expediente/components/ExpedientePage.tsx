import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useMe } from '@/features/auth/api';
import { useExpediente } from '../api';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { FormularioExpediente } from './FormularioExpediente';
import { ResumenExpediente } from './ResumenExpediente';

function Detalle({ id }: { id: string }) {
  const expediente = useExpediente(id);
  if (expediente.isPending) return <p>Cargando tu expediente…</p>;
  if (expediente.isError) {
    return <ErrorConReintento message="No se pudo cargar tu expediente." onRetry={() => void expediente.refetch()} />;
  }
  return expediente.data.estado === 'PENDIENTE' ? (
    <FormularioExpediente expediente={expediente.data} />
  ) : (
    <ResumenExpediente expediente={expediente.data} />
  );
}

// RF-09, RF-10: the student completes the expediente (PENDIENTE) or reads it (any other state).
export function ExpedientePage() {
  const me = useMe();
  const activo = me.data?.expedienteActivo;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Mi expediente</h1>
      {me.isPending && <p>Cargando tu expediente…</p>}
      {me.isError && <ErrorConReintento message="No se pudo cargar tu expediente." onRetry={() => void me.refetch()} />}
      {me.data && !activo && (
        <p role="status" className="rounded-lg border bg-muted p-3 text-slate-800">
          No tienes un expediente activo. Acude a vinculación.
        </p>
      )}
      {activo && <Detalle id={activo.id} />}
      <Button asChild variant="outline" className="h-11 w-full">
        <Link to="/alumno">Volver al inicio</Link>
      </Button>
    </main>
  );
}
