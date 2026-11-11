import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/features/auth/components/Field';
import { messageOf } from '../../importaciones/archivo';
import { useCrearSupervisor, type Supervisor } from '../api';
import {
  aSupervisorPayload,
  nuevoSupervisorSchema,
  VALORES_NUEVO_SUPERVISOR,
  type NuevoSupervisorValues,
} from '../schemas';

// RF-09: mini form to register a supervisor that is not listed. It lives inside the expediente <form>,
// so it is a group with a button (nested forms are invalid HTML) and Enter is handled here.
export function NuevoSupervisorForm({
  institucionId,
  onCreado,
}: {
  institucionId: string;
  onCreado: (supervisor: Supervisor) => void;
}) {
  const crear = useCrearSupervisor(institucionId);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NuevoSupervisorValues>({
    resolver: zodResolver(nuevoSupervisorSchema),
    defaultValues: VALORES_NUEVO_SUPERVISOR,
  });

  const enviar = handleSubmit(async (values) => {
    setError(null);
    try {
      const { supervisor } = await crear.mutateAsync(aSupervisorPayload(values));
      onCreado(supervisor);
    } catch (e) {
      setError(messageOf(e));
    }
  });

  return (
    <div
      role="group"
      aria-label="Datos del supervisor nuevo"
      className="flex flex-col gap-3 rounded-lg border p-3"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          void enviar();
        }
      }}
    >
      <Field id="sup-nombre" label="Nombre" autoComplete="off" error={errors.nombre?.message} {...register('nombre')} />
      <Field
        id="sup-apellido-paterno"
        label="Apellido paterno"
        autoComplete="off"
        error={errors.apellidoPaterno?.message}
        {...register('apellidoPaterno')}
      />
      <Field
        id="sup-correo"
        label="Correo"
        type="email"
        autoComplete="off"
        autoCapitalize="none"
        error={errors.correo?.message}
        {...register('correo')}
      />
      <Field id="sup-titulo" label="Título (opcional)" hint="Por ejemplo: Lic., Ing." error={errors.titulo?.message} {...register('titulo')} />
      <Field id="sup-apellido-materno" label="Apellido materno (opcional)" error={errors.apellidoMaterno?.message} {...register('apellidoMaterno')} />
      <Field id="sup-puesto" label="Puesto (opcional)" error={errors.puesto?.message} {...register('puesto')} />
      <Field id="sup-departamento" label="Departamento del supervisor (opcional)" error={errors.departamento?.message} {...register('departamento')} />
      <Field id="sup-telefono" label="Teléfono (opcional)" type="tel" error={errors.telefono?.message} {...register('telefono')} />
      <Field id="sup-extension" label="Extensión (opcional)" error={errors.extension?.message} {...register('extension')} />
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" className="h-11" disabled={crear.isPending} onClick={() => void enviar()}>
        {crear.isPending ? 'Agregando…' : 'Agregar supervisor'}
      </Button>
    </div>
  );
}
