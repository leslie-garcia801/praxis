import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/features/auth/components/Field';
import { messageOf } from '../../importaciones/archivo';
import type { NuevoSupervisorValues } from '../../expediente/schemas';
import { useEditarSupervisor, type SupervisorOficina } from '../api';
import { aEditarSupervisorPayload, editarSupervisorSchema, valoresDeSupervisor } from '../schemas';

function Formulario({ supervisor, onCerrar }: { supervisor: SupervisorOficina; onCerrar: () => void }) {
  const editar = useEditarSupervisor(supervisor.id);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NuevoSupervisorValues>({
    resolver: zodResolver(editarSupervisorSchema),
    defaultValues: valoresDeSupervisor(supervisor),
  });

  const enviar = handleSubmit(async (values) => {
    setError(null);
    try {
      await editar.mutateAsync(aEditarSupervisorPayload(values));
      onCerrar();
    } catch (e) {
      setError(messageOf(e));
    }
  });

  return (
    <form aria-label="Editar supervisor" onSubmit={(e) => void enviar(e)} noValidate className="flex max-w-xl flex-col gap-3 rounded-lg border p-3">
      <Field id="edit-sup-titulo" label="Título (opcional)" error={errors.titulo?.message} {...register('titulo')} />
      <Field id="edit-sup-nombre" label="Nombre" error={errors.nombre?.message} {...register('nombre')} />
      <Field id="edit-sup-apellido-paterno" label="Apellido paterno" error={errors.apellidoPaterno?.message} {...register('apellidoPaterno')} />
      <Field id="edit-sup-apellido-materno" label="Apellido materno (opcional)" error={errors.apellidoMaterno?.message} {...register('apellidoMaterno')} />
      <Field id="edit-sup-puesto" label="Puesto (opcional)" error={errors.puesto?.message} {...register('puesto')} />
      <Field id="edit-sup-departamento" label="Departamento del supervisor (opcional)" error={errors.departamento?.message} {...register('departamento')} />
      <Field id="edit-sup-correo" label="Correo" type="email" autoCapitalize="none" error={errors.correo?.message} {...register('correo')} />
      <Field id="edit-sup-telefono" label="Teléfono (opcional)" type="tel" error={errors.telefono?.message} {...register('telefono')} />
      <Field id="edit-sup-extension" label="Extensión (opcional)" error={errors.extension?.message} {...register('extension')} />
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={editar.isPending}>
          {editar.isPending ? 'Guardando…' : 'Guardar supervisor'}
        </Button>
        <Button type="button" variant="outline" disabled={editar.isPending} onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
    </form>
  );
}

// RF-09: the office fixes the supervisor data (contact included) from the detail.
export function EditarSupervisor({ supervisor }: { supervisor: SupervisorOficina }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button type="button" variant="outline" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
          Editar supervisor
        </Button>
      </div>
      {abierto && <Formulario supervisor={supervisor} onCerrar={() => setAbierto(false)} />}
    </div>
  );
}
