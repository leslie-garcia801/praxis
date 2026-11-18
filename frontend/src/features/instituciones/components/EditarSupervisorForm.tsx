import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { useActualizarSupervisor, type ReenvioEnlace, type Supervisor } from '@/features/expediente/api';
import { CamposSupervisor } from '@/features/expediente/components/CamposSupervisor';
import {
  aEditarSupervisorPayload,
  nuevoSupervisorSchema,
  valoresDeSupervisor,
  type NuevoSupervisorValues,
} from '@/features/expediente/schemas';
import { messageOf } from '@/features/importaciones/archivo';

// RF-09: the office fixes the data of a supervisor (a typo in the email, a new position...).
export function EditarSupervisorForm({
  supervisor,
  institucionId,
  onListo,
  onCancelar,
}: {
  supervisor: Supervisor;
  institucionId: string;
  // Receives the resend result after an email change (RF-21).
  onListo: (reenvio: ReenvioEnlace | null) => void;
  onCancelar: () => void;
}) {
  const actualizar = useActualizarSupervisor(institucionId, supervisor.id);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NuevoSupervisorValues>({
    resolver: zodResolver(nuevoSupervisorSchema),
    defaultValues: valoresDeSupervisor(supervisor),
  });

  const guardar = handleSubmit(async (values) => {
    setError(null);
    try {
      const { reenvio } = await actualizar.mutateAsync(aEditarSupervisorPayload(values));
      onListo(reenvio);
    } catch (e) {
      setError(messageOf(e));
    }
  });

  return (
    <div
      role="group"
      aria-label="Editar supervisor"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          void guardar();
        }
      }}
    >
      <CamposSupervisor prefijo={`edit-${supervisor.id}`} register={register} errors={errors} />
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" className="h-11" disabled={actualizar.isPending} onClick={() => void guardar()}>
          {actualizar.isPending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
