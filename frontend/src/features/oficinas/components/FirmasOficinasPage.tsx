import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ErrorConReintento } from '@/components/ErrorConReintento';
import { Button } from '@/components/ui/button';
import { Field } from '@/features/auth/components/Field';
import { messageOf } from '@/features/importaciones/archivo';
import { formatFecha } from '@/lib/tiempo';
import { useGuardarResponsable, useResponsables, type Responsable } from '../api';
import { firmaSchema, type FirmaValues } from '../schemas';

// One independent form per office. Its defaults come from the first load; saving resets it to what
// the server stored, never touching the other office's unsaved text.
function FormularioFirma({ responsable }: { responsable: Responsable }) {
  const { oficina, nombreOficina, nombre, cargo, actualizadoEn } = responsable;
  const tituloId = `firma-${oficina}-titulo`;
  const mutation = useGuardarResponsable(oficina);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FirmaValues>({
    resolver: zodResolver(firmaSchema),
    defaultValues: { nombre: nombre ?? '', cargo: cargo ?? '' },
  });

  async function onSubmit(values: FirmaValues) {
    try {
      const guardado = await mutation.mutateAsync(values);
      reset({ nombre: guardado.nombre ?? '', cargo: guardado.cargo ?? '' });
    } catch {
      // The message is shown from mutation.error.
    }
  }

  return (
    <form
      aria-labelledby={tituloId}
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      noValidate
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={tituloId} className="text-lg font-semibold">
          {nombreOficina}
        </h2>
        <p className="text-sm text-muted-foreground">
          {actualizadoEn ? `Actualizado el ${formatFecha(actualizadoEn)}` : 'Sin capturar'}
        </p>
      </div>
      <Field
        id={`firma-${oficina}-nombre`}
        label="Nombre"
        placeholder="Ing. Nombre Apellido"
        autoComplete="off"
        error={errors.nombre?.message}
        {...register('nombre')}
      />
      <Field
        id={`firma-${oficina}-cargo`}
        label="Cargo"
        autoComplete="off"
        error={errors.cargo?.message}
        {...register('cargo')}
      />
      {mutation.isError && (
        <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {messageOf(mutation.error)}
        </div>
      )}
      {mutation.isSuccess && !isDirty && (
        <p role="status" className="text-sm font-medium text-exito-foreground">
          Guardado
        </p>
      )}
      <Button type="submit" className="h-11 self-start" disabled={mutation.isPending || !isDirty}>
        {mutation.isPending ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  );
}

// RF-27, RF-29, specs §10: the admin sets who signs the hours report of each office.
export function FirmasOficinasPage() {
  const responsables = useResponsables();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-[1.75rem] font-extrabold">Firmas de las oficinas</h1>
      <p className="text-foreground">
        El nombre y el cargo aparecen en la firma del reporte PDF de horas de cada oficina.
      </p>
      {responsables.isPending && <p role="status">Cargando firmas…</p>}
      {responsables.isError && (
        <ErrorConReintento message={messageOf(responsables.error)} onRetry={() => void responsables.refetch()} />
      )}
      {responsables.data?.map((r) => <FormularioFirma key={r.oficina} responsable={r} />)}
    </main>
  );
}
