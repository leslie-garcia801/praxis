import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/features/auth/components/Field';
import { aPayload, DIAS, expedienteFormSchema, type ExpedienteFormValues } from '../../expediente/schemas';
import { messageOf } from '../../importaciones/archivo';
import { useEditarExpediente, type ExpedienteDetalle } from '../api';

// RF-10: the office edits the case file while it is still open. The backend applies the same states.
const ESTADOS_EDITABLES: ExpedienteDetalle['estado'][] = ['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'];

// Institution and supervisor are left out: the supervisor has its own action, and moving a case file with hours to
// another institution is a transfer (RN-12).
function valoresDe(e: ExpedienteDetalle): ExpedienteFormValues {
  return {
    institucionId: '',
    supervisorId: '',
    departamento: e.departamento ?? '',
    fechaInicio: e.fechaInicio ?? '',
    fechaTermino: e.fechaTermino ?? '',
    diasPactados: e.diasPactados,
    horaEntrada: e.horaEntrada ?? '',
    horaSalida: e.horaSalida ?? '',
    programa: e.programa ?? '',
    subprograma: e.subprograma ?? '',
  };
}

function Formulario({ expediente, onCerrar, onListo }: { expediente: ExpedienteDetalle; onCerrar: () => void; onListo: () => void }) {
  const { tipo } = expediente;
  const practicas = tipo === 'PRACTICAS';
  const editar = useEditarExpediente(expediente.id);
  const [error, setError] = useState<string | null>(null);
  const schema = useMemo(() => expedienteFormSchema(tipo), [tipo]);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<ExpedienteFormValues>({ resolver: zodResolver(schema), defaultValues: valoresDe(expediente) });
  const dias = useWatch({ control, name: 'diasPactados' });

  const alternarDia = (dia: number, marcado: boolean) =>
    setValue('diasPactados', marcado ? [...dias, dia] : dias.filter((d) => d !== dia), { shouldValidate: true });

  const enviar = handleSubmit(async (values) => {
    setError(null);
    // aPayload builds the body for the type; the office form never sends institution or supervisor.
    const cambios = aPayload(tipo, values);
    delete cambios.institucionId;
    delete cambios.supervisorId;
    try {
      await editar.mutateAsync(cambios);
      onListo();
    } catch (e) {
      setError(messageOf(e));
    }
  });

  return (
    <form aria-label="Editar expediente" onSubmit={(e) => void enviar(e)} noValidate className="flex max-w-xl flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-base font-semibold">Editar expediente</h3>
      <Field id="edit-exp-departamento" label="Departamento (opcional)" error={errors.departamento?.message} {...register('departamento')} />
      <Field id="edit-exp-fecha-inicio" label="Fecha de inicio" type="date" error={errors.fechaInicio?.message} {...register('fechaInicio')} />
      {practicas ? (
        <>
          <Field id="edit-exp-fecha-termino" label="Fecha de término" type="date" error={errors.fechaTermino?.message} {...register('fechaTermino')} />
          <fieldset className="flex flex-col gap-2" aria-describedby={errors.diasPactados ? 'edit-exp-dias-error' : undefined}>
            <legend className="mb-1 text-base font-semibold">Días pactados</legend>
            <div className="grid grid-cols-2 gap-2">
              {DIAS.map((d) => (
                <label key={d.valor} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-muted">
                  <input type="checkbox" className="size-5" checked={dias.includes(d.valor)} onChange={(e) => alternarDia(d.valor, e.target.checked)} />
                  {d.nombre}
                </label>
              ))}
            </div>
            {errors.diasPactados && (
              <p id="edit-exp-dias-error" className="text-sm text-destructive">
                {errors.diasPactados.message}
              </p>
            )}
          </fieldset>
          <Field id="edit-exp-hora-entrada" label="Hora de entrada" type="time" error={errors.horaEntrada?.message} {...register('horaEntrada')} />
          <Field id="edit-exp-hora-salida" label="Hora de salida" type="time" error={errors.horaSalida?.message} {...register('horaSalida')} />
        </>
      ) : (
        <>
          <Field id="edit-exp-programa" label="Programa (opcional)" error={errors.programa?.message} {...register('programa')} />
          <Field id="edit-exp-subprograma" label="Subprograma (opcional)" error={errors.subprograma?.message} {...register('subprograma')} />
        </>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={editar.isPending}>
          {editar.isPending ? 'Guardando…' : 'Guardar expediente'}
        </Button>
        <Button type="button" variant="outline" disabled={editar.isPending} onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
    </form>
  );
}

// RF-10: button plus inline form in the detail; hidden once the case file is finished or cancelled.
export function EditarExpediente({ expediente }: { expediente: ExpedienteDetalle }) {
  const [abierto, setAbierto] = useState(false);
  const [exito, setExito] = useState(false);
  if (!ESTADOS_EDITABLES.includes(expediente.estado)) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          aria-expanded={abierto}
          onClick={() => {
            setExito(false);
            setAbierto(!abierto);
          }}
        >
          Editar expediente
        </Button>
        {exito && <p role="status">Expediente actualizado.</p>}
      </div>
      {abierto && (
        <Formulario
          expediente={expediente}
          onCerrar={() => setAbierto(false)}
          onListo={() => {
            setAbierto(false);
            setExito(true);
          }}
        />
      )}
    </div>
  );
}
