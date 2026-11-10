import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Field } from '@/features/auth/components/Field';
import { ApiError } from '@/lib/api';
import { messageOf } from '../../importaciones/archivo';
import { useCarreras, useGuardarInstitucion, useInstitucion, type Carrera, type Institucion } from '../api';
import { aPayload, institucionFormSchema, VALORES_NUEVA, valoresDe, type InstitucionFormValues } from '../schemas';
import { DescargarQrButton } from './DescargarQrButton';

const LISTA = '/vinculacion/instituciones';

function Shell({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <Link to={LISTA} className="text-sm text-primary underline underline-offset-4">
        Volver a instituciones
      </Link>
      <h1 className="text-2xl font-bold">{titulo}</h1>
      {children}
    </main>
  );
}

function ErrorConReintento({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {messageOf(error)}
      </div>
      <Button variant="outline" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}

// RF-05 / RF-08: one screen for create (/nueva) and edit (/:id/editar).
export function InstitucionFormPage() {
  const { id } = useParams<{ id: string }>();
  const editando = id !== undefined;
  const titulo = editando ? 'Editar institución' : 'Nueva institución';
  const carreras = useCarreras();
  const institucion = useInstitucion(id);

  if (carreras.isError) {
    return (
      <Shell titulo={titulo}>
        <ErrorConReintento error={carreras.error} onRetry={() => void carreras.refetch()} />
      </Shell>
    );
  }
  if (editando && institucion.isError) {
    return (
      <Shell titulo={titulo}>
        <ErrorConReintento error={institucion.error} onRetry={() => void institucion.refetch()} />
      </Shell>
    );
  }
  if (carreras.data === undefined || (editando && institucion.data === undefined)) {
    return (
      <Shell titulo={titulo}>
        <p role="status" className="text-slate-700">
          Cargando…
        </p>
      </Shell>
    );
  }

  return (
    <Shell titulo={titulo}>
      {/* The form mounts once with the loaded data; later refetches (e.g. after a QR) must not reset it. */}
      <Formulario key={id ?? 'nueva'} id={id} carreras={carreras.data} inicial={institucion.data} />
    </Shell>
  );
}

function Formulario({ id, carreras, inicial }: { id: string | undefined; carreras: Carrera[]; inicial: Institucion | undefined }) {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  // Fresh data (after a QR download) only feeds the short code, never the form fields.
  const actual = useInstitucion(id).data ?? inicial;
  const guardar = useGuardarInstitucion(id);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<InstitucionFormValues>({
    resolver: zodResolver(institucionFormSchema),
    defaultValues: inicial ? valoresDe(inicial) : VALORES_NUEVA,
  });

  async function onSubmit(values: InstitucionFormValues) {
    setFormError(null);
    try {
      await guardar.mutateAsync(aPayload(values));
      void navigate('/vinculacion/instituciones');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'RFC_DUPLICADO') {
        setError('rfc', { message: error.message }, { shouldFocus: true });
      } else {
        setFormError(messageOf(error));
      }
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="flex flex-col gap-6">
      {actual && (
        <section aria-label="Código QR" className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-sm">
            Código corto: <code className="font-mono font-semibold">{actual.codigoCorto}</code>
          </p>
          <DescargarQrButton id={actual.id} nombre={actual.nombre} />
        </section>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">Datos generales</legend>
        <Field id="nombre" label="Nombre de la institución" error={errors.nombre?.message} {...register('nombre')} />
        <Field id="rfc" label="RFC" autoCapitalize="characters" error={errors.rfc?.message} {...register('rfc')} />
        <Field id="giro" label="Giro" error={errors.giro?.message} {...register('giro')} />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...register('esPlantel')} />
          Es un plantel
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">Domicilio</legend>
        <Field id="calle" label="Calle" error={errors.calle?.message} {...register('calle')} />
        <div className="grid grid-cols-2 gap-4">
          <Field id="numExterior" label="Número exterior" error={errors.numExterior?.message} {...register('numExterior')} />
          <Field id="numInterior" label="Número interior" error={errors.numInterior?.message} {...register('numInterior')} />
        </div>
        <Field id="colonia" label="Colonia" error={errors.colonia?.message} {...register('colonia')} />
        <Field id="codigoPostal" label="Código postal" error={errors.codigoPostal?.message} {...register('codigoPostal')} />
        <Field id="municipio" label="Municipio" error={errors.municipio?.message} {...register('municipio')} />
        <Field id="estado" label="Estado" error={errors.estado?.message} {...register('estado')} />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">Contacto</legend>
        <Field id="telefono" label="Teléfono" type="tel" error={errors.telefono?.message} {...register('telefono')} />
        <Field id="correo" label="Correo" type="email" error={errors.correo?.message} {...register('correo')} />
        <Field id="representante" label="Representante" error={errors.representante?.message} {...register('representante')} />
        <Field
          id="horarioAtencion"
          label="Horario de atención"
          error={errors.horarioAtencion?.message}
          {...register('horarioAtencion')}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-lg font-semibold">Programas y turnos</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...register('aceptaServicio')} />
          Acepta servicio social
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...register('aceptaPracticas')} />
          Acepta prácticas profesionales
        </label>
        <CheckboxGroup
          control={control}
          name="turnos"
          legend="Turnos"
          opciones={[
            { value: 'MATUTINO', label: 'Matutino' },
            { value: 'VESPERTINO', label: 'Vespertino' },
          ]}
        />
      </fieldset>

      <CheckboxGroup
        control={control}
        name="carreraIds"
        legend="Carreras que recibe"
        opciones={carreras.map((c) => ({ value: c.id, label: c.nombre }))}
      />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">Cupo y estado</legend>
        <Field
          id="cupo"
          label="Cupo"
          inputMode="numeric"
          hint="Déjalo vacío si no hay dato. Las instituciones sin dato de cupo no aparecen en el filtro «con cupo»."
          error={errors.cupo?.message}
          {...register('cupo')}
        />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...register('activa')} />
          Activa
        </label>
      </fieldset>

      {formError && (
        <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </div>
      )}
      <Button type="submit" size="lg" className="h-11 w-full sm:w-fit sm:px-6" disabled={guardar.isPending}>
        {guardar.isPending ? 'Guardando…' : 'Guardar institución'}
      </Button>
    </form>
  );
}

function CheckboxGroup<N extends 'turnos' | 'carreraIds'>({
  control,
  name,
  legend,
  opciones,
}: {
  control: Control<InstitucionFormValues>;
  name: N;
  legend: string;
  opciones: { value: InstitucionFormValues[N][number]; label: string }[];
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const selected = field.value as string[];
        return (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">{legend}</legend>
            {opciones.map((op) => (
              <label key={op.value} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={selected.includes(op.value)}
                  onChange={(e) =>
                    field.onChange(e.target.checked ? [...selected, op.value] : selected.filter((v) => v !== op.value))
                  }
                />
                {op.label}
              </label>
            ))}
          </fieldset>
        );
      }}
    />
  );
}
