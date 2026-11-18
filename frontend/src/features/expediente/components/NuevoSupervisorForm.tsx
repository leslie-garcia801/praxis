import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { messageOf } from '../../importaciones/archivo';
import { useCrearSupervisor, type Supervisor } from '../api';
import { CamposSupervisor } from './CamposSupervisor';
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
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          void enviar();
        }
      }}
    >
      <CamposSupervisor prefijo="sup" register={register} errors={errors} />
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
