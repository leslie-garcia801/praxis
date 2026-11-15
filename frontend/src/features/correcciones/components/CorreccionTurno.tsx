import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/features/auth/components/Field';
import { ApiError } from '@/lib/api';
import { diaMonterrey, formatHora, instanteMonterrey, sumarDias } from '@/lib/tiempo';
import type { Turno } from '../../historial/api';
import { useSolicitarCorreccion, type Correccion } from '../api';
import { correccionSchema, type CorreccionOutput, type CorreccionValues } from '../schemas';

const ERROR_RED = 'No se pudo enviar la solicitud. Revisa tu conexión e intenta de nuevo.';

function EstadoCorreccion({ correccion }: { correccion: Correccion }) {
  switch (correccion.estado) {
    case 'PENDIENTE':
      return (
        <p className="text-slate-800">
          {`Corrección en revisión: ${formatHora(correccion.entradaNueva)} – ${formatHora(correccion.salidaNueva)}`}
        </p>
      );
    case 'RECHAZADA':
      return (
        <div className="flex flex-col gap-0.5 text-slate-800">
          <p className="font-medium">Corrección rechazada</p>
          {correccion.comentario && <p>Comentario de tu oficina: «{correccion.comentario}»</p>}
        </div>
      );
    case 'APROBADA':
      return <p className="text-slate-800">Turno corregido por tu oficina</p>;
  }
}

function FormCorreccion({ turno, onCerrar }: { turno: Turno; onCerrar: () => void }) {
  const solicitar = useSolicitarCorreccion(turno.id);
  // The shift's day in Monterrey (RN-15): the entry stays on it; the exit may be on the next one.
  const fecha = diaMonterrey(turno.entrada);
  const salidaConocida = turno.estado === 'CERRADA' && turno.salida !== null;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CorreccionValues, unknown, CorreccionOutput>({
    resolver: zodResolver(correccionSchema),
    defaultValues: {
      entrada: formatHora(turno.entrada),
      salida: salidaConocida ? formatHora(turno.salida!) : '',
      salidaDiaSiguiente: salidaConocida && diaMonterrey(turno.salida!) !== fecha,
      motivo: '',
    },
  });

  function enviar({ entrada, salida, salidaDiaSiguiente, motivo }: CorreccionOutput) {
    solicitar.mutate(
      {
        entradaNueva: instanteMonterrey(fecha, entrada),
        salidaNueva: instanteMonterrey(salidaDiaSiguiente ? sumarDias(fecha, 1) : fecha, salida),
        motivo,
      },
      { onSuccess: onCerrar },
    );
  }

  const error = solicitar.error;
  const motivoId = `motivo-${turno.id}`;

  return (
    <form
      onSubmit={(e) => void handleSubmit(enviar)(e)}
      noValidate
      aria-label="Solicitar corrección"
      className="mt-2 flex flex-col gap-3 border-t pt-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field id={`entrada-${turno.id}`} label="Hora de entrada" type="time" error={errors.entrada?.message} {...register('entrada')} />
        <Field id={`salida-${turno.id}`} label="Hora de salida" type="time" error={errors.salida?.message} {...register('salida')} />
      </div>
      <div className="flex items-center gap-2">
        <input id={`dia-siguiente-${turno.id}`} type="checkbox" className="size-5" {...register('salidaDiaSiguiente')} />
        <Label htmlFor={`dia-siguiente-${turno.id}`}>La salida fue al día siguiente</Label>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={motivoId}>Motivo</Label>
        <Textarea
          id={motivoId}
          className="min-h-20"
          maxLength={500}
          aria-invalid={errors.motivo ? true : undefined}
          aria-describedby={errors.motivo ? `${motivoId}-error` : undefined}
          {...register('motivo')}
        />
        {errors.motivo && (
          <p id={`${motivoId}-error`} className="text-sm text-destructive">
            {errors.motivo.message}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-destructive">
          {error instanceof ApiError && error.code !== 'UNKNOWN_ERROR' ? error.message : ERROR_RED}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="h-11 flex-1" disabled={solicitar.isPending}>
          {solicitar.isPending ? 'Enviando…' : 'Enviar solicitud'}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={onCerrar} disabled={solicitar.isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// RF-17: the state of the shift's latest correction request and, when the API allows it, the request form.
export function CorreccionTurno({ turno }: { turno: Turno }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {turno.correccion && <EstadoCorreccion correccion={turno.correccion} />}
      {turno.puedeSolicitarCorreccion &&
        (abierto ? (
          <FormCorreccion turno={turno} onCerrar={() => setAbierto(false)} />
        ) : (
          <Button type="button" variant="outline" className="mt-1 h-11 self-start" onClick={() => setAbierto(true)}>
            Solicitar corrección
          </Button>
        ))}
    </>
  );
}
