import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/features/auth/components/Field';
import { messageOf } from '../../importaciones/archivo';
import { useGuardarExpediente, type Expediente } from '../api';
import {
  aPayload,
  DIAS,
  etiquetaFaltante,
  expedienteFormSchema,
  valoresDe,
  type ExpedienteFormValues,
} from '../schemas';
import { SelectorInstitucion } from './SelectorInstitucion';
import { SelectorSupervisor } from './SelectorSupervisor';

// RF-10: the student completes the expediente while it is PENDIENTE. Only the format is validated here.
export function FormularioExpediente({ expediente }: { expediente: Expediente }) {
  const { tipo } = expediente;
  const practicas = tipo === 'PRACTICAS';
  const guardar = useGuardarExpediente(expediente.id);
  const [faltantes, setFaltantes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const schema = useMemo(() => expedienteFormSchema(tipo), [tipo]);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<ExpedienteFormValues>({ resolver: zodResolver(schema), defaultValues: valoresDe(expediente) });

  const institucionId = useWatch({ control, name: 'institucionId' });
  const supervisorId = useWatch({ control, name: 'supervisorId' });
  const dias = useWatch({ control, name: 'diasPactados' });

  function elegirInstitucion(id: string) {
    if (id === institucionId) return;
    setValue('institucionId', id);
    // The supervisor belongs to an institution: a new institution means choosing again.
    setValue('supervisorId', '');
  }

  function alternarDia(valor: number, marcado: boolean) {
    const siguientes = marcado ? [...dias, valor] : dias.filter((d) => d !== valor);
    setValue('diasPactados', siguientes.sort((a, b) => a - b), { shouldValidate: errors.diasPactados !== undefined });
  }

  async function onSubmit(values: ExpedienteFormValues) {
    setError(null);
    setFaltantes(null);
    try {
      const { expediente: guardado } = await guardar.mutateAsync(aPayload(tipo, values));
      setFaltantes(guardado.faltantes);
    } catch (e) {
      setError(messageOf(e));
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="flex flex-col gap-5">
      <SelectorInstitucion
        tipo={tipo}
        valueId={institucionId}
        guardada={expediente.institucion}
        onChange={elegirInstitucion}
      />
      <SelectorSupervisor
        institucionId={institucionId || undefined}
        valueId={supervisorId}
        onChange={(id) => setValue('supervisorId', id)}
      />

      <Field
        id="departamento"
        label="Departamento (opcional)"
        hint="Área de la institución donde estarás."
        error={errors.departamento?.message}
        {...register('departamento')}
      />
      <Field id="fecha-inicio" label="Fecha de inicio" type="date" error={errors.fechaInicio?.message} {...register('fechaInicio')} />

      {practicas ? (
        <>
          <Field id="fecha-termino" label="Fecha de término" type="date" error={errors.fechaTermino?.message} {...register('fechaTermino')} />
          <fieldset className="flex flex-col gap-2" aria-describedby={errors.diasPactados ? 'dias-error' : undefined}>
            <legend className="mb-1 text-base font-semibold">Días pactados</legend>
            <div className="grid grid-cols-2 gap-2">
              {DIAS.map((d) => (
                <label key={d.valor} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-muted">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={dias.includes(d.valor)}
                    onChange={(e) => alternarDia(d.valor, e.target.checked)}
                  />
                  {d.nombre}
                </label>
              ))}
            </div>
            {errors.diasPactados && (
              <p id="dias-error" className="text-sm text-destructive">
                {errors.diasPactados.message}
              </p>
            )}
          </fieldset>
          <Field id="hora-entrada" label="Hora de entrada" type="time" error={errors.horaEntrada?.message} {...register('horaEntrada')} />
          <Field id="hora-salida" label="Hora de salida" type="time" error={errors.horaSalida?.message} {...register('horaSalida')} />
        </>
      ) : (
        <>
          <Field id="programa" label="Programa (opcional)" error={errors.programa?.message} {...register('programa')} />
          <Field id="subprograma" label="Subprograma (opcional)" error={errors.subprograma?.message} {...register('subprograma')} />
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {faltantes && (
        <div role="status" className="rounded-lg border bg-muted p-3 text-slate-800">
          {faltantes.length === 0 ? (
            <p>Listo. Vinculación revisará tu expediente para confirmarlo</p>
          ) : (
            <>
              <p>Aún falta completar:</p>
              <ul className="list-disc pl-5">
                {faltantes.map((f) => (
                  <li key={f}>{etiquetaFaltante(f)}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <Button type="submit" size="lg" className="h-12 w-full" disabled={guardar.isPending}>
        {guardar.isPending ? 'Guardando…' : 'Guardar expediente'}
      </Button>
    </form>
  );
}
